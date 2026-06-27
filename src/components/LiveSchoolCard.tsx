import { SchoolCard } from '../types';

const TIER_COLOR: Record<string, { bg: string; fg: string }> = {
  冲: { bg: 'rgba(245, 108, 108, 0.12)', fg: '#e5484d' },
  稳: { bg: 'rgba(79, 70, 229, 0.12)', fg: 'var(--td-brand-color)' },
  保: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#16a34a' },
};

interface LiveSchoolCardProps {
  card: SchoolCard;
  /** 用于错落入场延迟 */
  index: number;
  variant: '一志愿' | '调剂';
}

/**
 * 直播速查精简卡片：大字突出关键录取数据，无快捷筛选/收藏。
 * 根节点带 .card-pop-in 入场动画，按 index 错落。
 */
export function LiveSchoolCard({ card, index, variant }: LiveSchoolCardProps) {
  const tags: string[] = [];
  if (card.isDualClass) tags.push('双一流');
  if (card.is985) tags.push('985');
  if (card.is211) tags.push('211');
  if (card.level && !tags.length) tags.push(card.level);

  const tier = card.tier;
  const tierStyle = tier ? TIER_COLOR[tier] : undefined;
  const scoreLabel = variant === '一志愿' ? '录取最低' : '调剂最低';

  return (
    <div
      className="admin-card card-pop-in p-4"
      style={{ borderRadius: 'var(--td-radius-large)', animationDelay: `${index * 45}ms` }}
    >
      {/* 头部：校名 + 标签 + 冲稳保 */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-base font-semibold truncate"
              style={{ color: 'var(--td-text-color-primary)' }}
            >
              {card.schoolName}
            </span>
            {tags.map((t) => (
              <span
                key={t}
                className="text-[11px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--td-brand-color-light)', color: 'var(--td-brand-color)' }}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="text-xs mt-1 truncate" style={{ color: 'var(--td-text-color-secondary)' }}>
            {[card.provinceName, card.subjectName].filter(Boolean).join(' · ')}
          </div>
        </div>
        {tier && tierStyle && (
          <span
            className="flex-shrink-0 px-2.5 py-1 rounded-lg text-sm font-bold"
            style={{ backgroundColor: tierStyle.bg, color: tierStyle.fg }}
          >
            {tier}
          </span>
        )}
      </div>

      {/* 大字分数 + 分差 */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold leading-none" style={{ color: 'var(--td-brand-color)' }}>
            {card.lowestScore ?? '—'}
          </span>
          <span className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
            {scoreLabel}（{card.year}）
          </span>
        </div>
        {typeof card.scoreDiff === 'number' && (
          <div className="text-sm font-semibold" style={{ color: card.scoreDiff >= 0 ? '#16a34a' : '#e5484d' }}>
            分差 {card.scoreDiff >= 0 ? `+${card.scoreDiff}` : card.scoreDiff}
          </div>
        )}
        <div className="text-xs ml-auto text-right space-y-0.5" style={{ color: 'var(--td-text-color-secondary)' }}>
          {typeof card.averageScore === 'number' && card.averageScore > 0 && <div>平均 {card.averageScore}</div>}
          {typeof card.admissions === 'number' && <div>录取 {card.admissions} 人</div>}
        </div>
      </div>
    </div>
  );
}
