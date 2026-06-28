import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, MessagePlugin, Popconfirm } from 'tdesign-react';
import { DeleteIcon, ChevronLeftIcon } from 'tdesign-icons-react';
import { Library, Megaphone } from 'lucide-react';
import { FavoriteCaseDetail, FavoriteCaseSummary } from '../types';
import { RecommendResult } from '../components/RecommendResult';

export function CaseLibraryPage() {
  const [cases, setCases] = useState<FavoriteCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FavoriteCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── 一键生成宣传文案 ──
  const [generating, setGenerating] = useState(false);
  const [copyText, setCopyText] = useState('');
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cases');
      const data = await res.json();
      setCases(data.cases || []);
    } catch {
      MessagePlugin.error('获取案例失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/cases/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '获取详情失败');
      setCopyText('');
      setDetail(data);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    abortRef.current?.abort();
    setCopyText('');
    setDetail(null);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/cases/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        MessagePlugin.success('已删除');
        if (detail?.id === id) setDetail(null);
        fetchCases();
      } catch (e: any) {
        MessagePlugin.error(e?.message || '删除失败');
      }
    },
    [detail, fetchCases]
  );

  // 一键生成小红书文案（SSE 流式）
  const handleGenerate = useCallback(async () => {
    if (!detail) return;
    setGenerating(true);
    setCopyText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/cases/${detail.id}/promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || '生成失败');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          let evt: any;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.type === 'text' && evt.content) {
            acc += evt.content;
            setCopyText(acc);
          } else if (evt.type === 'done') {
            if (evt.fullText) {
              acc = evt.fullText;
              setCopyText(acc);
            }
          } else if (evt.type === 'error') {
            throw new Error(evt.message || '生成失败');
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      MessagePlugin.error(e?.message || '生成失败');
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [detail]);

  const handleCopyToClipboard = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      MessagePlugin.success('已复制到剪贴板');
    } catch {
      MessagePlugin.error('复制失败，请手动选择文本');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!copyText.trim() || !detail) return;
    setSaving(true);
    try {
      const title =
        (detail.title && detail.title.slice(0, 40)) ||
        copyText.replace(/^标题[:：]\s*/m, '').split('\n')[0].slice(0, 40) ||
        '案例宣传文案';
      const res = await fetch('/api/promo/copies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: copyText, feedIds: [], feedSnapshot: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '保存失败');
      MessagePlugin.success('已保存到「推广神器 → 我的文案」');
    } catch (e: any) {
      MessagePlugin.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [copyText, detail]);

  // 详情视图
  if (detail) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Button variant="text" icon={<ChevronLeftIcon />} onClick={closeDetail}>
              返回列表
            </Button>
            <div className="flex items-center gap-2">
              <Button
                theme="primary"
                icon={<Megaphone size={16} />}
                loading={generating}
                onClick={handleGenerate}
              >
                一键生成宣传文案
              </Button>
              <Popconfirm content="确定删除该案例？" onConfirm={() => handleDelete(detail.id)}>
                <Button variant="outline" theme="danger" icon={<DeleteIcon />}>
                  删除
                </Button>
              </Popconfirm>
            </div>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
            {detail.title}
          </h2>
          <div className="text-xs mb-5" style={{ color: 'var(--td-text-color-placeholder)' }}>
            {new Date(detail.createdAt).toLocaleString('zh-CN')}
            {detail.note ? ` · ${detail.note}` : ''}
          </div>

          {/* 宣传文案（生成结果展示在推荐结果上方） */}
          {(generating || copyText) && (
            <div className="admin-card p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
                  小红书文案{generating ? '（生成中…）' : ''}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="small"
                    variant="outline"
                    disabled={!copyText.trim() || generating}
                    onClick={() => handleCopyToClipboard(copyText)}
                  >
                    复制
                  </Button>
                  <Button
                    size="small"
                    theme="primary"
                    loading={saving}
                    disabled={!copyText.trim() || generating}
                    onClick={handleSave}
                  >
                    保存
                  </Button>
                </div>
              </div>
              <div
                className="text-sm whitespace-pre-wrap leading-relaxed"
                style={{ color: 'var(--td-text-color-primary)' }}
              >
                {copyText || '正在生成…'}
              </div>
            </div>
          )}

          <RecommendResult result={detail.result} />
        </div>
      </div>
    );
  }

  // 列表视图
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>
          案例收藏库
        </h2>

        {loading ? (
          <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
            加载中…
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center mt-16">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--td-brand-color-light)' }}
            >
              <Library size={30} color="var(--td-brand-color)" />
            </div>
            <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
              还没有收藏的案例。在「志愿推荐」里点击结果上的「★ 收藏案例」即可保存。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cases.map((c) => (
              <div key={c.id} className="admin-card is-clickable p-4" onClick={() => openDetail(c.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-semibold truncate" style={{ color: 'var(--td-text-color-primary)' }}>
                      {c.title}
                    </div>
                    {c.candidateSummary && (
                      <div className="text-xs mt-1 truncate" style={{ color: 'var(--td-text-color-secondary)' }}>
                        {c.candidateSummary}
                      </div>
                    )}
                    <div className="text-xs mt-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
                      {new Date(c.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <Popconfirm content="确定删除该案例？" onConfirm={() => handleDelete(c.id)}>
                    <Button
                      variant="text"
                      shape="circle"
                      icon={<DeleteIcon />}
                      onClick={(e) => (e as any).stopPropagation?.()}
                    />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
        {detailLoading && (
          <div className="text-sm mt-3" style={{ color: 'var(--td-text-color-secondary)' }}>
            加载详情…
          </div>
        )}
      </div>
    </div>
  );
}
