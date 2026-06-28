import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, MessagePlugin, Popconfirm, Tabs, Tag, Input, Select, Table } from 'tdesign-react';
import type { PrimaryTableCol } from 'tdesign-react';
import { DeleteIcon, RefreshIcon } from 'tdesign-icons-react';
import { Megaphone } from 'lucide-react';

const { TabPanel } = Tabs;

interface FeedItem {
  _id: string;
  title?: string;
  link?: string;
  isoDate?: string;
  tags?: string[];
  feedMeta?: { title?: string };
}

interface ScoreRecord {
  _id?: string;
  schoolName?: string;
  level?: string;
  subjectName?: string;
  subjectCode?: string;
  year?: number;
  studyForm?: string;
  applicants?: number | string;
  firstChoiceAdmissions?: number;
  adjustedAdmissions?: number;
  lowestScore?: number;
  averageScore?: number;
  highestScore?: number;
}

interface SavedCopy {
  id: string;
  title: string;
  content: string;
  feedIds: string[];
  createdAt: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

const fmtNum = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('zh-CN');
const fmtScore = (v: unknown) => (!v || Number(v) === 0 ? '—' : String(v));

export function PromoPage() {
  const [tab, setTab] = useState<string>('feeds');

  // ── 资讯 tab ──
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedsError, setFeedsError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── 文案生成 ──
  const [generating, setGenerating] = useState(false);
  const [copyText, setCopyText] = useState('');
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── 数据 tab（考研院校专业历年录取数据）──
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresError, setScoresError] = useState<string | null>(null);
  const [scoreTotal, setScoreTotal] = useState(0);
  const [scorePage, setScorePage] = useState(1);
  const [scoreFilters, setScoreFilters] = useState({ schoolName: '', subject: '', year: '', level: '' });
  const [years, setYears] = useState<number[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const scoresLoadedRef = useRef(false);
  const SCORE_PAGE_SIZE = 20;

  // ── 我的文案 tab ──
  const [copies, setCopies] = useState<SavedCopy[]>([]);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const copiesLoadedRef = useRef(false);

  const fetchFeeds = useCallback(async (kw?: string) => {
    setFeedsLoading(true);
    setFeedsError(null);
    try {
      const qs = new URLSearchParams({ pageSize: '30' });
      if (kw) qs.set('keyword', kw);
      const res = await fetch(`/api/promo/feeds?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '获取资讯失败');
      setFeeds(data.list || []);
    } catch (e: any) {
      setFeedsError(e?.message || '获取资讯失败');
    } finally {
      setFeedsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  const fetchScores = useCallback(
    async (page: number, filters: typeof scoreFilters) => {
      setScoresLoading(true);
      setScoresError(null);
      try {
        const qs = new URLSearchParams({ page: String(page), pageSize: String(SCORE_PAGE_SIZE) });
        if (filters.schoolName) qs.set('schoolName', filters.schoolName);
        if (filters.subject) qs.set('subject', filters.subject);
        if (filters.year) qs.set('year', filters.year);
        if (filters.level) qs.set('level', filters.level);
        const res = await fetch(`/api/promo/scores?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || '获取录取数据失败');
        setScores(data.list || []);
        setScoreTotal(data.pagination?.total ?? (data.list || []).length);
        setScorePage(page);
      } catch (e: any) {
        setScoresError(e?.message || '获取录取数据失败');
        setScores([]);
      } finally {
        setScoresLoading(false);
      }
    },
    []
  );

  const fetchScoreMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/promo/scores/meta');
      const data = await res.json();
      if (!res.ok) return;
      setYears(Array.isArray(data.years) ? data.years : []);
      setLevels(Array.isArray(data.levels) ? data.levels : []);
    } catch {
      /* 筛选项可选，失败忽略 */
    }
  }, []);

  const scoreColumns: PrimaryTableCol<ScoreRecord>[] = [
    { colKey: 'schoolName', title: '学校', width: 140, ellipsis: true },
    { colKey: 'level', title: '层次', width: 90, cell: ({ row }) => row.level || '—' },
    {
      colKey: 'subjectName',
      title: '专业',
      width: 160,
      ellipsis: true,
      cell: ({ row }) => `${row.subjectName || ''}${row.subjectCode ? `（${row.subjectCode}）` : ''}` || '—',
    },
    { colKey: 'year', title: '年份', width: 70 },
    { colKey: 'studyForm', title: '形式', width: 90, cell: ({ row }) => row.studyForm || '—' },
    { colKey: 'firstChoiceAdmissions', title: '一志愿', width: 80, cell: ({ row }) => fmtNum(row.firstChoiceAdmissions) },
    { colKey: 'adjustedAdmissions', title: '调剂', width: 80, cell: ({ row }) => fmtNum(row.adjustedAdmissions) },
    { colKey: 'lowestScore', title: '最低分', width: 80, cell: ({ row }) => fmtScore(row.lowestScore) },
    { colKey: 'averageScore', title: '均分', width: 80, cell: ({ row }) => fmtScore(row.averageScore) },
    { colKey: 'highestScore', title: '最高分', width: 80, cell: ({ row }) => fmtScore(row.highestScore) },
  ];

  const fetchCopies = useCallback(async () => {
    setCopiesLoading(true);
    try {
      const res = await fetch('/api/promo/copies');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '获取文案失败');
      setCopies(data.copies || []);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '获取文案失败');
    } finally {
      setCopiesLoading(false);
    }
  }, []);

  // 切 tab 时懒加载
  useEffect(() => {
    if (tab === 'data' && !scoresLoadedRef.current) {
      scoresLoadedRef.current = true;
      fetchScoreMeta();
      fetchScores(1, scoreFilters);
    }
    if (tab === 'saved' && !copiesLoadedRef.current) {
      copiesLoadedRef.current = true;
      fetchCopies();
    }
  }, [tab, fetchScoreMeta, fetchScores, scoreFilters, fetchCopies]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    const feedIds = Array.from(selected);
    if (feedIds.length === 0) {
      MessagePlugin.warning('请至少选择一条资讯');
      return;
    }
    const feedSnapshot = feeds.filter((f) => selected.has(f._id));
    setGenerating(true);
    setCopyText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/promo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedIds, feedSnapshot }),
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
  }, [selected, feeds]);

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
    if (!copyText.trim()) return;
    setSaving(true);
    try {
      const feedIds = Array.from(selected);
      const feedSnapshot = feeds.filter((f) => selected.has(f._id));
      const title = copyText.replace(/^标题[:：]\s*/m, '').split('\n')[0].slice(0, 40) || '推广文案';
      const res = await fetch('/api/promo/copies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: copyText, feedIds, feedSnapshot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '保存失败');
      MessagePlugin.success('已保存到「我的文案」');
      copiesLoadedRef.current = true;
      fetchCopies();
    } catch (e: any) {
      MessagePlugin.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [copyText, selected, feeds, fetchCopies]);

  const deleteCopy = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/promo/copies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      MessagePlugin.success('已删除');
      setCopies((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      MessagePlugin.error(e?.message || '删除失败');
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone size={20} color="var(--td-brand-color)" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            推广神器
          </h2>
        </div>

        <Tabs value={tab} onChange={(v) => setTab(String(v))}>
          {/* ── 资讯 ── */}
          <TabPanel value="feeds" label="资讯">
            <div className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Input
                  value={keyword}
                  onChange={(v) => setKeyword(String(v))}
                  placeholder="按关键词搜索资讯"
                  onEnter={() => fetchFeeds(keyword)}
                  style={{ maxWidth: 280 }}
                />
                <Button variant="outline" icon={<RefreshIcon />} onClick={() => fetchFeeds(keyword)}>
                  搜索
                </Button>
                <div className="flex-1" />
                <Button
                  theme="primary"
                  loading={generating}
                  disabled={selected.size === 0}
                  onClick={handleGenerate}
                >
                  一键生成宣传文案（{selected.size}）
                </Button>
              </div>

              {/* 文案生成结果（展示在资讯列表上方） */}
              {(generating || copyText) && (
                <div className="admin-card p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
                      宣传文案{generating ? '（生成中…）' : ''}
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

              {feedsLoading ? (
                <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  加载中…
                </div>
              ) : feedsError ? (
                <div className="text-sm" style={{ color: 'var(--td-error-color)' }}>
                  {feedsError}
                  <Button variant="text" theme="primary" onClick={() => fetchFeeds(keyword)}>
                    重试
                  </Button>
                </div>
              ) : feeds.length === 0 ? (
                <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  暂无资讯
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {feeds.map((f) => {
                    const isSel = selected.has(f._id);
                    return (
                      <div
                        key={f._id}
                        className="admin-card is-clickable p-3"
                        style={isSel ? { borderColor: 'var(--td-brand-color)' } : undefined}
                        onClick={() => toggleSelect(f._id)}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(f._id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ marginTop: 4 }}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-sm font-medium"
                              style={{ color: 'var(--td-text-color-primary)' }}
                            >
                              {f.title || '无标题'}
                            </div>
                            <div
                              className="flex items-center gap-2 flex-wrap text-xs mt-1"
                              style={{ color: 'var(--td-text-color-placeholder)' }}
                            >
                              {f.feedMeta?.title && <span>{f.feedMeta.title}</span>}
                              {f.isoDate && <span>{formatDate(f.isoDate)}</span>}
                              {(f.tags || []).slice(0, 3).map((t) => (
                                <Tag key={t} size="small" variant="light">
                                  {t}
                                </Tag>
                              ))}
                              {f.link && (
                                <a
                                  href={f.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ color: 'var(--td-brand-color)' }}
                                >
                                  查看原文 ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabPanel>

          {/* ── 数据：考研院校专业历年录取数据 ── */}
          <TabPanel value="data" label="数据">
            <div className="pt-4">
              <div className="text-sm mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
                考研院校专业历年录取数据
              </div>

              {/* 筛选栏 */}
              <div className="flex items-end gap-2 flex-wrap mb-3">
                <Input
                  value={scoreFilters.schoolName}
                  onChange={(v) => setScoreFilters((s) => ({ ...s, schoolName: String(v) }))}
                  placeholder="学校名，如 北京大学"
                  onEnter={() => fetchScores(1, scoreFilters)}
                  style={{ width: 160 }}
                />
                <Input
                  value={scoreFilters.subject}
                  onChange={(v) => setScoreFilters((s) => ({ ...s, subject: String(v) }))}
                  placeholder="专业名/代码"
                  onEnter={() => fetchScores(1, scoreFilters)}
                  style={{ width: 150 }}
                />
                <Select
                  value={scoreFilters.year}
                  onChange={(v) => setScoreFilters((s) => ({ ...s, year: v ? String(v) : '' }))}
                  placeholder="年份"
                  clearable
                  style={{ width: 110 }}
                  options={years.map((y) => ({ label: String(y), value: String(y) }))}
                />
                <Select
                  value={scoreFilters.level}
                  onChange={(v) => setScoreFilters((s) => ({ ...s, level: v ? String(v) : '' }))}
                  placeholder="院校层次"
                  clearable
                  style={{ width: 130 }}
                  options={levels.map((l) => ({ label: l, value: l }))}
                />
                <Button theme="primary" loading={scoresLoading} onClick={() => fetchScores(1, scoreFilters)}>
                  搜索
                </Button>
              </div>

              {scoresError ? (
                <div className="text-sm mb-2" style={{ color: 'var(--td-error-color)' }}>
                  {scoresError}
                  <Button variant="text" theme="primary" onClick={() => fetchScores(scorePage, scoreFilters)}>
                    重试
                  </Button>
                </div>
              ) : null}

              <Table
                rowKey="_id"
                data={scores}
                columns={scoreColumns}
                loading={scoresLoading}
                size="small"
                bordered
                stripe
                maxHeight={520}
                empty="未找到符合条件的录取数据"
                pagination={{
                  current: scorePage,
                  pageSize: SCORE_PAGE_SIZE,
                  total: scoreTotal,
                  showJumper: true,
                  onChange: (info) => fetchScores(info.current, scoreFilters),
                }}
              />
            </div>
          </TabPanel>

          {/* ── 我的文案 ── */}
          <TabPanel value="saved" label="我的文案">
            <div className="pt-4">
              <div className="flex items-center justify-end mb-3">
                <Button variant="text" icon={<RefreshIcon />} onClick={fetchCopies}>
                  刷新
                </Button>
              </div>
              {copiesLoading ? (
                <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  加载中…
                </div>
              ) : copies.length === 0 ? (
                <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  还没有保存的文案。在「资讯」里生成文案后点击「保存」。
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {copies.map((c) => (
                    <div key={c.id} className="admin-card p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div
                            className="text-sm font-semibold truncate"
                            style={{ color: 'var(--td-text-color-primary)' }}
                          >
                            {c.title}
                          </div>
                          <div className="text-xs mt-1" style={{ color: 'var(--td-text-color-placeholder)' }}>
                            {formatDate(c.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => handleCopyToClipboard(c.content)}
                          >
                            复制
                          </Button>
                          <Popconfirm content="确定删除该文案？" onConfirm={() => deleteCopy(c.id)}>
                            <Button variant="text" shape="circle" icon={<DeleteIcon />} />
                          </Popconfirm>
                        </div>
                      </div>
                      <div
                        className="text-sm whitespace-pre-wrap leading-relaxed"
                        style={{ color: 'var(--td-text-color-secondary)' }}
                      >
                        {c.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}
