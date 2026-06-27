import { Button } from 'tdesign-react';
import { FilterDelta, RecommendResult as RecommendResultType } from '../types';
import { SchoolScoreCard } from './SchoolScoreCard';

interface QuickFilterDef {
  label: string;
  delta: FilterDelta;
}

const QUICK_FILTERS: QuickFilterDef[] = [
  { label: '上限 +5分', delta: { firstMaxDelta: 5 } },
  { label: '上限 -5分', delta: { firstMaxDelta: -5 } },
  { label: '下限 +5分', delta: { firstMinDelta: 5 } },
  { label: '下限 -5分', delta: { firstMinDelta: -5 } },
  { label: '双一流', delta: { level: '双一流' } },
  { label: '211', delta: { level: '211' } },
  { label: '985', delta: { level: '985' } },
  { label: '不限层次', delta: { level: null } },
];

interface RecommendResultProps {
  result: RecommendResultType;
  /** 点击快捷筛选时增量重查；只读模式（案例详情）不传 */
  onQuickFilter?: (delta: FilterDelta) => void;
  /** 收藏；只读模式不传 */
  onFavorite?: () => void;
  busy?: boolean;
}

export function RecommendResult({ result, onQuickFilter, onFavorite, busy }: RecommendResultProps) {
  const { parsedQuery, groups, note } = result;

  return (
    <div className="space-y-5">
      {/* 解析出的查询条件摘要 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
          {note && <div className="mb-1" style={{ color: 'var(--td-text-color-primary)' }}>{note}</div>}
          <span>
            条件：
            {parsedQuery.score ? `总分≈${parsedQuery.score}　` : ''}
            {parsedQuery.subjectName ? `专业「${parsedQuery.subjectName}」　` : ''}
            {parsedQuery.provinceName ? `地区「${parsedQuery.provinceName}」　` : ''}
            {parsedQuery.level ? `层次「${parsedQuery.level}」　` : ''}
            一志愿分段 {parsedQuery.band.firstMin}~{parsedQuery.band.firstMax}
          </span>
        </div>
        {onFavorite && (
          <Button size="small" variant="outline" theme="primary" onClick={onFavorite} disabled={busy}>
            ★ 收藏案例
          </Button>
        )}
      </div>

      {/* 两组候选 */}
      {groups.map((group) => (
        <div key={group.category}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
              {group.category}候选
            </span>
            <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
              {group.items.length} 所
            </span>
          </div>
          {group.items.length === 0 ? (
            <div
              className="text-xs px-3 py-4 rounded-lg text-center"
              style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-placeholder)' }}
            >
              无符合条件的{group.category}候选，试试放宽分数上下限或层次
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {group.items.map((card, i) => (
                <SchoolScoreCard key={`${card.schoolCode}-${card.subjectCode}-${i}`} card={card} variant={group.category} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 快捷筛选 */}
      {onQuickFilter && (
        <div className="pt-1">
          <div className="text-xs mb-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
            快捷调整（在本次条件上追加检索）：
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.label}
                className="suggestion-chip"
                disabled={busy}
                onClick={() => onQuickFilter(f.delta)}
                style={busy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
