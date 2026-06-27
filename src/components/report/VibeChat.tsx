import { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';
import { MessageInput } from './ui/MessageInput';
import { ThinkingBlock } from './ThinkingBlock';
import { ReportCard } from './ReportCard';
import { parseContext, type CandidateContext } from '../../lib/school-report-agent';
import type { VibeReport, Tier } from './types';

/** 配置：择校 / 调剂复用同一对话组件，仅文案与接口不同。 */
export interface VibeChatConfig {
  apiEndpoint: string;
  welcomeEmoji: string;
  welcomeTitle: string;
  welcomeDesc: string;
  exampleText: string;
  /** 报告卡片标题，如「择校报告」「调剂报告」 */
  reportTitle: string;
  reportEmoji: string;
  /** 报告名词，用于流程文案，如「择校报告」「调剂报告」 */
  reportNoun: string;
  sectionLabels: Record<Tier, string>;
}

// ─── Block types ──────────────────────────────────────────────────────────────

type UserBlock = { id: string; kind: 'user'; text: string };
type ThinkingBlockData = { id: string; kind: 'thinking'; label: string; steps: string[]; done: boolean };
type AssistantBlock = { id: string; kind: 'assistant'; text: string; streaming: boolean };
type ReportBlockData = { id: string; kind: 'report'; data: VibeReport };
type Block = UserBlock | ThinkingBlockData | AssistantBlock | ReportBlockData;

type Phase =
  | 'idle'
  | 'thinking'
  | 'asking_score'
  | 'asking_subject'
  | 'asking_major'
  | 'asking_region'
  | 'researching'
  | 'done';

const QUESTIONS: Record<string, string> = {
  score: '📊 请问您的高考成绩是多少分？（480–680 分之间）',
  subject: '📐 您的选科方向是哪个组合？\n（物理组合 / 历史组合）',
  major: '📚 您有意向的专业方向吗？\n（例如：计算机、金融、医学、法学 等，可填「不限」）',
  region: '📍 对就读城市或省份有偏好吗？\n（例如：北京、上海、江苏、不限 等）',
};

let _uidCounter = 0;
function uid() {
  _uidCounter += 1;
  return `b${_uidCounter}_${_uidCounter.toString(36)}`;
}

async function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VibeChat({ config }: { config: VibeChatConfig }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [isStreaming, setIsStreaming] = useState(false);

  const phaseRef = useRef<Phase>('idle');
  const ctxRef = useRef<CandidateContext>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function syncPhase(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length]);

  function addBlock(block: Block) {
    setBlocks((prev) => [...prev, block]);
  }

  function updateBlock(id: string, updater: (b: Block) => Block) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? updater(b) : b)));
    const el = containerRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      el.scrollTop = el.scrollHeight;
    }
  }

  async function runThinking(label: string, steps: string[]) {
    const id = uid();
    addBlock({ id, kind: 'thinking', label, steps: [], done: false });
    await wait(400);
    for (let i = 0; i < steps.length; i++) {
      await wait(1000 + Math.random() * 500);
      updateBlock(id, (b) => (b.kind === 'thinking' ? { ...b, steps: steps.slice(0, i + 1) } : b));
    }
    await wait(600);
    updateBlock(id, (b) => (b.kind === 'thinking' ? { ...b, done: true } : b));
  }

  async function streamAssistant(text: string) {
    setIsStreaming(true);
    const id = uid();
    addBlock({ id, kind: 'assistant', text: '', streaming: true });
    for (let i = 0; i < text.length; i++) {
      await wait(14 + Math.random() * 10);
      updateBlock(id, (b) => (b.kind === 'assistant' ? { ...b, text: text.slice(0, i + 1) } : b));
    }
    updateBlock(id, (b) => (b.kind === 'assistant' ? { ...b, streaming: false } : b));
    setIsStreaming(false);
  }

  function nextMissing(): 'score' | 'subject' | 'major' | 'region' | null {
    const ctx = ctxRef.current;
    if (!ctx.score) return 'score';
    if (!ctx.subjectGroup) return 'subject';
    if (!ctx.majorKeywords?.length) return 'major';
    if (!ctx.region) return 'region';
    return null;
  }

  async function askQuestion(key: 'score' | 'subject' | 'major' | 'region') {
    syncPhase(`asking_${key}` as Phase);
    await streamAssistant(QUESTIONS[key]);
  }

  async function runResearch() {
    syncPhase('researching');
    const ctx = ctxRef.current;
    const score = ctx.score ?? 550;
    const subjectGroup = ctx.subjectGroup ?? 'physics';
    const majorKeywords = ctx.majorKeywords ?? [];
    const region = ctx.region ?? '不限';
    const subjectLabel = subjectGroup === 'physics' ? '物理组合' : '历史组合';
    const majorLabel = majorKeywords.length ? majorKeywords.join('、') : '综合方向';

    await runThinking('🔍 分析考生画像', [
      `读取高考成绩：${score} 分，选科：${subjectLabel}`,
      `识别专业意向：${majorLabel}`,
      `解析地域偏好：${region}`,
      '构建考生综合画像完毕',
    ]);

    await wait(600);

    await runThinking('📦 检索院校数据库', [
      `查询 2025 年河北省高考录取数据（${subjectLabel}）…`,
      `筛选分数相关区间院校…`,
      `匹配「${majorLabel}」相关专业…`,
      `按冲、稳、保梯度分层排序…`,
      `补全 985 / 211 / 双一流 标签…`,
      '院校列表生成完毕，共筛选出候选组合若干',
    ]);

    await wait(600);

    await runThinking(`✍️ 撰写${config.reportNoun}`, [
      '评估各院校录取概率…',
      '生成冲刺院校推荐理由…',
      '生成稳妥院校推荐理由…',
      '生成保底院校推荐理由…',
      '汇总报考策略与注意事项…',
      '报告草稿校验通过',
    ]);

    await wait(400);

    let report: VibeReport;
    try {
      const res = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score,
          subjectGroup,
          majorKeywords,
          regionPrefs: region !== '不限' ? [region] : [],
        }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) throw new Error(json.message ?? '查询失败，请重试');
      report = json.data as VibeReport;
    } catch (err) {
      await streamAssistant(
        `⚠️ 数据查询遇到问题：${err instanceof Error ? err.message : String(err)}\n请稍后重试。`
      );
      syncPhase('done');
      return;
    }

    await streamAssistant(
      `✅ 分析完成！\n\n根据您的情况（高考 ${score} 分 · ${subjectLabel} · 专业方向：${majorLabel} · 地区偏好：${region}），已为您生成个性化${config.reportNoun}：`
    );

    await wait(300);
    addBlock({ id: uid(), kind: 'report', data: report });
    syncPhase('done');
  }

  async function handleFirstMessage(_text: string) {
    syncPhase('thinking');
    await runThinking('💡 规划分析策略', [
      '理解考生描述，提取关键信息…',
      '识别高考成绩、选科、专业偏好…',
      '检测地域偏好与院校层次要求…',
      '标注缺失信息，规划追问顺序…',
      '初始化报告生成流程',
    ]);

    const missing = nextMissing();
    if (missing) {
      await askQuestion(missing);
    } else {
      await runResearch();
    }
  }

  async function handleAnswer(currentPhase: Phase, text: string) {
    const parsed = parseContext(text);
    const key = (currentPhase as string).replace('asking_', '');

    if (key === 'score' && !parsed.score) {
      const m = text.match(/\b([4-7]\d{2})\b/);
      parsed.score = m ? parseInt(m[0]) : 550;
    }
    if (key === 'subject' && !parsed.subjectGroup) {
      if (/物理|理|physics/i.test(text)) parsed.subjectGroup = 'physics';
      else if (/历史|文|history/i.test(text)) parsed.subjectGroup = 'history';
      else parsed.subjectGroup = 'physics';
    }
    if (key === 'major' && !parsed.majorKeywords?.length) {
      const trimmed = text.trim();
      if (trimmed && !/不限|不清楚/.test(trimmed)) {
        parsed.majorKeywords = [trimmed];
      } else {
        parsed.majorKeywords = [];
      }
    }
    if (key === 'region' && !parsed.region) {
      parsed.region = text.trim() || '不限';
    }

    ctxRef.current = { ...ctxRef.current, ...parsed };

    const missing = nextMissing();
    if (missing) {
      await askQuestion(missing);
    } else {
      await runResearch();
    }
  }

  async function handleSubmit(text: string) {
    const currentPhase = phaseRef.current;
    if (
      currentPhase === 'thinking' ||
      currentPhase === 'researching' ||
      currentPhase === 'done' ||
      isStreaming
    )
      return;

    addBlock({ id: uid(), kind: 'user', text });

    if (currentPhase === 'idle') {
      ctxRef.current = parseContext(text);
      await handleFirstMessage(text);
    } else if (
      currentPhase === 'asking_score' ||
      currentPhase === 'asking_subject' ||
      currentPhase === 'asking_major' ||
      currentPhase === 'asking_region'
    ) {
      await handleAnswer(currentPhase, text);
    }
  }

  function reset() {
    setBlocks([]);
    ctxRef.current = {};
    setIsStreaming(false);
    syncPhase('idle');
  }

  const inputDisabled = phase === 'thinking' || phase === 'researching' || isStreaming;

  const placeholder =
    phase === 'idle'
      ? '描述你的高考情况，回车开始规划…'
      : phase === 'asking_score'
      ? '输入高考成绩（如 580）…'
      : phase === 'asking_subject'
      ? '物理组合 或 历史组合…'
      : phase === 'asking_major'
      ? '输入专业方向（如 计算机、金融，或填「不限」）…'
      : phase === 'asking_region'
      ? '输入城市偏好（如 北京、不限）…'
      : '分析中，请稍候…';

  return (
    <div className="report-scope flex h-full flex-col overflow-hidden rounded-lg border">
      {/* Chat area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          {/* Empty / welcome state */}
          {blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-3xl">
                {config.welcomeEmoji}
              </div>
              <div>
                <p className="text-xl font-semibold tracking-tight">{config.welcomeTitle}</p>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{config.welcomeDesc}</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-muted px-4 py-2 text-xs text-muted-foreground">
                <span className="opacity-60">💬 示例：</span>
                <span>{config.exampleText}</span>
              </div>
            </div>
          )}

          {/* Render blocks */}
          {blocks.map((block) => {
            if (block.kind === 'user') {
              return (
                <div key={block.id} className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm text-accent-foreground">
                    {block.text}
                  </div>
                </div>
              );
            }

            if (block.kind === 'thinking') {
              return (
                <ThinkingBlock key={block.id} label={block.label} steps={block.steps} done={block.done} />
              );
            }

            if (block.kind === 'assistant') {
              return (
                <div key={block.id} className="flex justify-start">
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap'
                    )}
                  >
                    {block.text}
                    {block.streaming && (
                      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground align-middle opacity-70" />
                    )}
                  </div>
                </div>
              );
            }

            if (block.kind === 'report') {
              return (
                <ReportCard
                  key={block.id}
                  data={block.data}
                  title={config.reportTitle}
                  emoji={config.reportEmoji}
                  sectionLabels={config.sectionLabels}
                />
              );
            }

            return null;
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input / restart area */}
      {phase === 'done' ? (
        <div className="flex items-center justify-center gap-3 border-t p-3">
          <span className="text-xs text-muted-foreground">报告已生成</span>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新分析
          </button>
        </div>
      ) : (
        <MessageInput disabled={inputDisabled} placeholder={placeholder} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
