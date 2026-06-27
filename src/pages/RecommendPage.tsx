import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Textarea, MessagePlugin, Dialog, Input } from 'tdesign-react';
import { FilterDelta, ParsedQuery, RecommendResult as RecommendResultType } from '../types';
import { RecommendResult } from '../components/RecommendResult';
import { VoiceInputButton } from '../components/VoiceInputButton';

interface Turn {
  id: string;
  query: string; // 用户原始输入（快捷筛选则为描述）
  loading: boolean;
  error?: string;
  result?: RecommendResultType;
}

function summarize(pq: ParsedQuery | undefined): string {
  if (!pq) return '志愿推荐案例';
  const parts = [
    pq.score ? `${pq.score}分` : '',
    pq.subjectName || '',
    pq.provinceName || '',
    pq.level || '',
  ].filter(Boolean);
  return parts.join(' · ') || '志愿推荐案例';
}

export function RecommendPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // 收藏弹窗
  const [favOpen, setFavOpen] = useState(false);
  const [favTitle, setFavTitle] = useState('');
  const [favNote, setFavNote] = useState('');
  const favTurnRef = useRef<Turn | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const callRecommend = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setTurns((prev) => [...prev, { id: turnId, query: label, loading: true }]);
      setBusy(true);
      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `请求失败 (${res.status})`);
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, loading: false, result: data } : t))
        );
      } catch (e: any) {
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, loading: false, error: e?.message || '推荐失败' } : t))
        );
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    callRecommend(text, { message: text });
  }, [input, busy, callRecommend]);

  const handleQuickFilter = useCallback(
    (prevResult: RecommendResultType, delta: FilterDelta) => {
      if (busy) return;
      const labelParts: string[] = [];
      if (delta.firstMaxDelta) labelParts.push(`上限${delta.firstMaxDelta > 0 ? '+' : ''}${delta.firstMaxDelta}`);
      if (delta.firstMinDelta) labelParts.push(`下限${delta.firstMinDelta > 0 ? '+' : ''}${delta.firstMinDelta}`);
      if (delta.level !== undefined) labelParts.push(`层次=${delta.level || '不限'}`);
      callRecommend(`调整：${labelParts.join('，') || '重查'}`, {
        prevQuery: prevResult.parsedQuery,
        filterDelta: delta,
      });
    },
    [busy, callRecommend]
  );

  const openFavorite = useCallback((turn: Turn) => {
    favTurnRef.current = turn;
    setFavTitle(summarize(turn.result?.parsedQuery));
    setFavNote('');
    setFavOpen(true);
  }, []);

  const confirmFavorite = useCallback(async () => {
    const turn = favTurnRef.current;
    if (!turn?.result) return;
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: favTitle || summarize(turn.result.parsedQuery),
          candidateSummary: summarize(turn.result.parsedQuery),
          query: turn.result.parsedQuery,
          result: turn.result,
          note: favNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '收藏失败');
      MessagePlugin.success('已收藏到案例库');
      setFavOpen(false);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '收藏失败');
    }
  }, [favTitle, favNote]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 对话/结果区 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {turns.length === 0 && (
            <div className="text-center mt-10">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg mx-auto"
                style={{ background: 'linear-gradient(135deg, var(--td-brand-color), var(--td-brand-color-hover))' }}
              >
                <span className="text-3xl">🎓</span>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
                志愿推荐
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--td-text-color-secondary)' }}>
                用自然语言描述考生情况与意向，自动推荐一志愿 / 调剂候选院校
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  '考生总分约 350，想去江苏的计算机专业，冲一冲 211',
                  '初试 370 分，法律硕士，目标北京的双一流',
                  '总分 310，机械工程，求稳，看看有哪些能调剂的学校',
                ].map((s) => (
                  <button key={s} className="suggestion-chip" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              {/* 用户气泡 */}
              <div className="flex justify-end">
                <div
                  className="px-4 py-2.5 rounded-2xl max-w-[80%] text-sm"
                  style={{ backgroundColor: 'var(--td-brand-color)', color: '#fff', borderRadius: '16px 16px 4px 16px' }}
                >
                  {turn.query}
                </div>
              </div>

              {/* 结果 */}
              {turn.loading && (
                <div className="text-sm px-1" style={{ color: 'var(--td-text-color-secondary)' }}>
                  正在解析需求并检索院校…
                </div>
              )}
              {turn.error && (
                <div
                  className="text-sm px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(245,108,108,0.1)', color: '#e5484d' }}
                >
                  {turn.error}
                </div>
              )}
              {turn.result && (
                <RecommendResult
                  result={turn.result}
                  busy={busy}
                  onQuickFilter={(delta) => handleQuickFilter(turn.result!, delta)}
                  onFavorite={() => openFavorite(turn)}
                />
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* 输入区 */}
      <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: 'var(--td-component-stroke)' }}>
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <div className="flex-1">
            <Textarea
              value={input}
              onChange={(v) => setInput(v as string)}
              placeholder="例如：考生总分约 350，想去江苏的计算机专业，冲一冲 211（可点击右侧麦克风语音输入）"
              autosize={{ minRows: 1, maxRows: 5 }}
              onKeydown={(_, ctx) => {
                const e = ctx.e as React.KeyboardEvent;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
          </div>
          <VoiceInputButton onTranscript={(t) => setInput(t)} disabled={busy} />
          <Button theme="primary" loading={busy} onClick={handleSend}>
            推荐
          </Button>
        </div>
      </div>

      {/* 收藏弹窗 */}
      <Dialog
        visible={favOpen}
        header="收藏为案例"
        onClose={() => setFavOpen(false)}
        onConfirm={confirmFavorite}
        confirmBtn="收藏"
        cancelBtn="取消"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
              案例标题
            </label>
            <Input value={favTitle} onChange={(v) => setFavTitle(v as string)} placeholder="案例标题" />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
              备注（可选）
            </label>
            <Textarea value={favNote} onChange={(v) => setFavNote(v as string)} placeholder="备注说明" autosize={{ minRows: 2, maxRows: 4 }} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
