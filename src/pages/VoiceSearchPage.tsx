import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, MessagePlugin } from 'tdesign-react';
import { RecommendResult as RecommendResultType } from '../types';
import { useVolcAsr } from '../hooks/useVolcAsr';
import { VoiceOrb, OrbPhase } from '../components/VoiceOrb';
import { LiveSchoolCard } from '../components/LiveSchoolCard';

/** 直播速查：只看一志愿前 5 个，画面紧凑 */
const MAX_PER_GROUP = 5;
const EXAMPLES = [
  '四百分 想去上海的法律硕士 最好是211',
  '三百五 计算机 江苏 冲一冲',
  '三百一 机械工程 求稳 看看能调剂的',
];

/** 结果指纹：用作交叉淡变的 React key + 变化检测 */
function fingerprint(r: RecommendResultType): string {
  return [
    r.note || '',
    r.parsedQuery?.score ?? '',
    r.parsedQuery?.subjectName ?? '',
    r.parsedQuery?.provinceName ?? '',
    r.parsedQuery?.level ?? '',
    ...r.groups.map((g) => `${g.category}:${g.items.length}:${g.items[0]?.schoolCode ?? ''}`),
  ].join('|');
}

function ConditionTags({ result }: { result: RecommendResultType }) {
  const pq = result.parsedQuery;
  const tags = [
    pq.score ? `总分≈${pq.score}` : '',
    pq.subjectName ? `专业「${pq.subjectName}」` : '',
    pq.provinceName ? `地区「${pq.provinceName}」` : '',
    pq.level ? `层次「${pq.level}」` : '',
  ].filter(Boolean);
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {tags.map((t, i) => (
        <span
          key={t}
          className="tag-pop text-xs px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: 'var(--td-brand-color-light)',
            color: 'var(--td-brand-color)',
            animationDelay: `${i * 60}ms`,
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function ResultBody({ result }: { result: RecommendResultType }) {
  return (
    <div className="space-y-5">
      {result.note && (
        <div className="text-center text-sm" style={{ color: 'var(--td-text-color-primary)' }}>
          {result.note}
        </div>
      )}
      <ConditionTags result={result} />
      {result.groups
        .filter((group) => group.category === '一志愿')
        .map((group) => {
        const items = group.items.slice(0, MAX_PER_GROUP);
        return (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
                {group.category}候选
              </span>
              <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                {group.items.length} 所
              </span>
            </div>
            {items.length === 0 ? (
              <div
                className="text-xs px-3 py-4 rounded-lg text-center"
                style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-placeholder)' }}
              >
                无符合条件的{group.category}候选
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {items.map((card, i) => (
                  <LiveSchoolCard
                    key={`${card.schoolCode}-${card.subjectCode}-${i}`}
                    card={card}
                    index={i}
                    variant={group.category}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function VoiceSearchPage() {
  const { supported, listening, transcript, start, stop, reset, error: asrError } = useVolcAsr();

  const [result, setResult] = useState<RecommendResultType | null>(null);
  const [prevResult, setPrevResult] = useState<RecommendResultType | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');

  const seqRef = useRef(0);
  const lastQueriedRef = useRef('');
  const lastFireRef = useRef(0);
  const resultRef = useRef<RecommendResultType | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const transcriptRef = useRef('');
  transcriptRef.current = transcript;

  const phase: OrbPhase = listening ? 'listening' : searching ? 'searching' : 'idle';

  /** 应用新结果：旧结果转为退出层做交叉淡变 */
  const applyResult = useCallback((data: RecommendResultType) => {
    const old = resultRef.current;
    if (old && fingerprint(old) !== fingerprint(data)) {
      setPrevResult(old);
      window.setTimeout(() => setPrevResult(null), 320);
    }
    resultRef.current = data;
    setResult(data);
  }, []);

  const fireSearch = useCallback(
    async (raw: string, opts?: { fast?: boolean }) => {
      const text = raw.trim();
      if (text.length < 3) return;
      if (text === lastQueriedRef.current) return;
      lastQueriedRef.current = text;
      const my = ++seqRef.current;
      setSearching(true);
      setError('');
      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, fast: opts?.fast ?? false }),
        });
        const data = await res.json();
        if (my !== seqRef.current) return; // 已被更新的请求取代
        if (!res.ok) throw new Error(data?.error || `请求失败 (${res.status})`);
        applyResult(data);
      } catch (e: any) {
        if (my === seqRef.current) {
          setError(e?.message || '检索失败');
          MessagePlugin.error(e?.message || '检索失败');
        }
      } finally {
        if (my === seqRef.current) setSearching(false);
      }
    },
    [applyResult]
  );

  // 转写文本变化 → 节流快档检索（连续说话也持续出结果，不必等停顿/松手）
  useEffect(() => {
    if (!transcript) return;
    const THROTTLE_MS = 450;
    const now = Date.now();
    const since = now - lastFireRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (since >= THROTTLE_MS) {
      lastFireRef.current = now;
      fireSearch(transcript, { fast: true });
    } else {
      // 距上次触发未到节流间隔 → 排一个尾随触发，用最新文本
      debounceRef.current = setTimeout(() => {
        lastFireRef.current = Date.now();
        fireSearch(transcriptRef.current, { fast: true });
      }, THROTTLE_MS - since);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [transcript, fireSearch]);

  // 空格键 push-to-talk
  useEffect(() => {
    if (!supported) return;
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping()) return;
      e.preventDefault();
      reset();
      lastQueriedRef.current = '';
      start();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping()) return;
      e.preventDefault();
      stop();
      // 松开后不再重新检索：录音过程中的实时（快档）检索即为最终结果。
      // 不清除已排队的尾随实时检索，让最后说出的几个字也能反映到结果里。
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [supported, start, stop, reset]);

  const handleManualSearch = useCallback(() => {
    const text = manualInput.trim();
    if (!text) return;
    lastQueriedRef.current = '';
    fireSearch(text);
  }, [manualInput, fireSearch]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 min-h-full flex flex-col">
        {/* 标题 */}
        <div className="text-center shrink-0">
          <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
            言出法随
          </h2>
          <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
            直播答疑时，按住空格说话，边说边检索关键录取数据
          </p>
        </div>

        {/* 上半区：结果在球上方浮现，底部对齐贴近球（交叉淡变） */}
        <div className="flex-1 min-h-0 w-full flex flex-col justify-end overflow-y-auto py-4">
          <div className="relative">
            {prevResult && (
              <div className="result-layer-exit" key={`prev-${fingerprint(prevResult)}`}>
                <ResultBody result={prevResult} />
              </div>
            )}
            {result && (
              <div className="result-layer-enter" key={fingerprint(result)}>
                <ResultBody result={result} />
              </div>
            )}
          </div>
        </div>

        {/* 中央：麦克风球（位置固定居中） */}
        <div className="shrink-0 flex justify-center">
          <VoiceOrb phase={phase} />
        </div>

        {/* 下半区：转写 / 示例 / 错误 / 降级输入 */}
        <div className="flex-1 min-h-0 w-full flex flex-col items-center pt-4 gap-3">
          {/* 转写行 / 引导 */}
          <div className="text-center min-h-[2.5rem]">
            {transcript ? (
              <p className="text-lg font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
                {transcript}
                {listening && (
                  <span
                    className="inline-block w-0.5 h-5 ml-1 align-middle animate-pulse"
                    style={{ backgroundColor: 'var(--td-brand-color)' }}
                  />
                )}
              </p>
            ) : (
              !result && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {EXAMPLES.map((s) => (
                    <button key={s} className="suggestion-chip" onClick={() => fireSearch(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {(error || asrError) && (
            <div
              className="text-sm px-3 py-2 rounded-lg text-center"
              style={{ backgroundColor: 'rgba(245,108,108,0.1)', color: '#e5484d' }}
            >
              {asrError || error}
            </div>
          )}

          {/* 不支持语音的降级兜底 */}
          {!supported && (
            <div className="max-w-xl w-full flex items-center gap-2">
              <div className="flex-1">
                <Input
                  value={manualInput}
                  onChange={(v) => setManualInput(v as string)}
                  placeholder="当前浏览器不支持语音输入，请在此键入需求（建议使用 Chrome / Edge）"
                  onEnter={handleManualSearch}
                />
              </div>
              <Button theme="primary" loading={searching} onClick={handleManualSearch}>
                检索
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
