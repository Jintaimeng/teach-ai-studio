import { Tag } from 'tdesign-react';
import { SchoolCard } from '../types';

const TIER_COLOR: Record<string, { bg: string; fg: string }> = {
  冲: { bg: 'rgba(245, 108, 108, 0.12)', fg: '#e5484d' },
  稳: { bg: 'rgba(79, 70, 229, 0.12)', fg: 'var(--td-brand-color)' },
  保: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#16a34a' },
};

interface SchoolScoreCardProps {
  card: SchoolCard;
  /** 一志愿展示录取分，调剂展示调剂分（文案差异） */
  variant: '一志愿' | '调剂';
}

export function SchoolScoreCard({ card, variant }: SchoolScoreCardProps) {
  const tags: string[] = [];
  if (card.isDualClass) tags.push('双一流');
  if (card.is985) tags.push('985');
  if (card.is211) tags.push('211');
  if (card.level && !tags.length) tags.push(card.level);

  const tier = card.tier;
  const tierStyle = tier ? TIER_COLOR[tier] : undefined;

  const scoreLabel = variant === '一志愿' ? '一志愿录取分' : '调剂录取分';

  return (
    <div className="admin-card p-4" style={{ borderRadius: 'var(--td-radius-large)' }}>
      {/* 头部：校名 + 层次标签 + 冲稳保 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold truncate" style={{ color: 'var(--td-text-color-primary)' }}>
              {card.schoolName}
            </span>
            {tags.map((t) => (
              <Tag key={t} size="small" variant="light" theme="primary">
                {t}
              </Tag>
            ))}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
            {[card.provinceName, card.schoolCode].filter(Boolean).join(' · ')}
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

      {/* 专业 */}
      <div className="text-sm mb-3" style={{ color: 'var(--td-text-color-primary)' }}>
        {card.subjectName}
        <span className="text-xs ml-1" style={{ color: 'var(--td-text-color-placeholder)' }}>
          {card.subjectCode}
          {card.college ? ` · ${card.college}` : ''}
        </span>
      </div>

      {/* 分数行 */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <div className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
            {scoreLabel}（{card.year}）
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold" style={{ color: 'var(--td-brand-color)' }}>
              {card.lowestScore ?? '—'}
            </span>
            <span className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
              最低
            </span>
          </div>
        </div>
        <div className="text-xs space-y-0.5" style={{ color: 'var(--td-text-color-secondary)' }}>
          {typeof card.averageScore === 'number' && card.averageScore > 0 && <div>平均 {card.averageScore}</div>}
          {typeof card.highestScore === 'number' && card.highestScore > 0 && <div>最高 {card.highestScore}</div>}
        </div>
        <div className="text-xs space-y-0.5 ml-auto text-right" style={{ color: 'var(--td-text-color-secondary)' }}>
          {typeof card.admissions === 'number' && <div>录取 {card.admissions} 人</div>}
          {typeof card.scoreDiff === 'number' && (
            <div>
              分差{' '}
              <span style={{ color: card.scoreDiff >= 0 ? '#16a34a' : '#e5484d', fontWeight: 600 }}>
                {card.scoreDiff >= 0 ? `+${card.scoreDiff}` : card.scoreDiff}
              </span>
            </div>
          )}
        </div>
      </div>

      {card.remarks && (
        <div className="text-xs mt-2 pt-2 border-t" style={{ color: 'var(--td-text-color-placeholder)', borderColor: 'var(--td-component-stroke)' }}>
          {card.remarks}
        </div>
      )}
    </div>
  );
}
