import { useState } from 'react';
import { Button } from 'tdesign-react';
import { FilterDelta, RecommendResult as RecommendResultType, SchoolCard } from '../types';
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

/** 默认每组/每档展示的院校数量，其余折叠，可展开加载更多 */
const INITIAL_VISIBLE = 3;

const TIER_ORDER: Array<'冲' | '稳' | '保'> = ['冲', '稳', '保'];
const TIER_DESC: Record<'冲' | '稳' | '保', string> = {
  冲: '冲刺',
  稳: '稳妥',
  保: '保底',
};
const TIER_COLOR: Record<'冲' | '稳' | '保', { bg: string; fg: string }> = {
  冲: { bg: 'rgba(245, 108, 108, 0.12)', fg: '#e5484d' },
  稳: { bg: 'rgba(79, 70, 229, 0.12)', fg: 'var(--td-brand-color)' },
  保: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#16a34a' },
};

/** 一组院校卡片：默认展示前 INITIAL_VISIBLE 所，超出部分可展开 / 收起 */
function CollapsibleCards({ items, variant }: { items: SchoolCard[]; variant: '一志愿' | '调剂' }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);
  const hidden = items.length - INITIAL_VISIBLE;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visible.map((card, i) => (
          <SchoolScoreCard key={`${card.schoolCode}-${card.subjectCode}-${i}`} card={card} variant={variant} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          className="mt-2 text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--td-brand-color)', backgroundColor: 'var(--td-bg-color-component)' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起' : `展开加载更多（还有 ${hidden} 所）`}
        </button>
      )}
    </>
  );
}

interface RecommendResultProps {
  result: RecommendResultType;
  /** 点击快捷筛选时增量重查；只读模式（案例详情）不传 */
  onQuickFilter?: (delta: FilterDelta) => void;
  /** 收藏；只读模式不传 */
  onFavorite?: () => void;
  /** 是否已收藏（用于按钮态） */
  favorited?: boolean;
  busy?: boolean;
}

export function RecommendResult({ result, onQuickFilter, onFavorite, favorited, busy }: RecommendResultProps) {
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
          <Button
            size="small"
            variant="outline"
            theme={favorited ? 'success' : 'primary'}
            onClick={onFavorite}
            disabled={busy || favorited}
          >
            {favorited ? '✓ 已收藏' : '★ 收藏案例'}
          </Button>
        )}
      </div>

      {/* 候选分组 */}
      {groups.map((group) => {
        // 一志愿且卡片带有冲/稳/保档位时，按档位分桶，每档默认 3 所
        const hasTiers = group.category === '一志愿' && group.items.some((c) => c.tier);

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

            {group.items.length === 0 ? (
              <div
                className="text-xs px-3 py-4 rounded-lg text-center"
                style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-placeholder)' }}
              >
                无符合条件的{group.category}候选，试试放宽分数上下限或层次
              </div>
            ) : hasTiers ? (
              <div className="space-y-4">
                {TIER_ORDER.map((tier) => {
                  const tierItems = group.items.filter((c) => c.tier === tier);
                  if (tierItems.length === 0) return null;
                  const color = TIER_COLOR[tier];
                  return (
                    <div key={tier}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: color.bg, color: color.fg }}
                        >
                          {tier}（{TIER_DESC[tier]}）
                        </span>
                        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          {tierItems.length} 所
                        </span>
                      </div>
                      <CollapsibleCards items={tierItems} variant={group.category} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <CollapsibleCards items={group.items} variant={group.category} />
            )}
          </div>
        );
      })}

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
