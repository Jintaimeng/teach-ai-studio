import { useCallback, useEffect, useState } from 'react';
import { Button, MessagePlugin, Popconfirm } from 'tdesign-react';
import { DeleteIcon, ChevronLeftIcon } from 'tdesign-icons-react';
import { Library } from 'lucide-react';
import { FavoriteCaseDetail, FavoriteCaseSummary } from '../types';
import { RecommendResult } from '../components/RecommendResult';

export function CaseLibraryPage() {
  const [cases, setCases] = useState<FavoriteCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FavoriteCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      setDetail(data);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '获取详情失败');
    } finally {
      setDetailLoading(false);
    }
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

  // 详情视图
  if (detail) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Button variant="text" icon={<ChevronLeftIcon />} onClick={() => setDetail(null)}>
              返回列表
            </Button>
            <Popconfirm content="确定删除该案例？" onConfirm={() => handleDelete(detail.id)}>
              <Button variant="outline" theme="danger" icon={<DeleteIcon />}>
                删除
              </Button>
            </Popconfirm>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
            {detail.title}
          </h2>
          <div className="text-xs mb-5" style={{ color: 'var(--td-text-color-placeholder)' }}>
            {new Date(detail.createdAt).toLocaleString('zh-CN')}
            {detail.note ? ` · ${detail.note}` : ''}
          </div>
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
