import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Separator } from './ui/Separator';
import { cn } from '../../utils/cn';
import type { VibeReport, SchoolRec, Tier } from './types';

/** 报告卡片（移植自 yanbot-claw，支持择校/调剂复用：标题与档位文案可配置）。 */

const TIER_CONFIG: Record<Tier, { badge: string; row: string }> = {
  冲: {
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    row: 'border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-900/10',
  },
  稳: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    row: 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10',
  },
  保: {
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    row: 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10',
  },
};

const DEFAULT_SECTION_LABELS: Record<Tier, string> = {
  冲: '冲刺志愿',
  稳: '稳妥志愿',
  保: '保底志愿',
};

function SchoolRow({ rec }: { rec: SchoolRec }) {
  const cfg = TIER_CONFIG[rec.tier];
  const sign = rec.scoreDiff >= 0 ? '+' : '';
  return (
    <div className={cn('rounded-lg border p-3 space-y-1.5', cfg.row)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold shrink-0', cfg.badge)}>
            {rec.tier}
          </span>
          <span className="text-sm font-medium">{rec.name}</span>
          {rec.badge && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground shrink-0">
              {rec.badge}
            </span>
          )}
          {rec.location && <span className="text-xs text-muted-foreground">{rec.location}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-sm">
          <span className="text-xs text-muted-foreground">最低</span>
          <span className="font-medium tabular-nums">{rec.minScore}</span>
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              rec.scoreDiff >= 0 ? 'text-green-600' : 'text-orange-600'
            )}
          >
            {sign}
            {rec.scoreDiff}
          </span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{rec.reason}</p>
    </div>
  );
}

export function ReportCard({
  data,
  title = '择校报告',
  emoji = '🎓',
  sectionLabels = DEFAULT_SECTION_LABELS,
}: {
  data: VibeReport;
  title?: string;
  emoji?: string;
  sectionLabels?: Record<Tier, string>;
}) {
  const { candidate, overview, recs, tips } = data;

  const grouped = (['冲', '稳', '保'] as const)
    .map((tier) => ({ tier, items: recs.filter((r) => r.tier === tier) }))
    .filter((g) => g.items.length > 0);

  const subjectLabel = candidate.subjectGroup === 'physics' ? '物理' : '历史';

  return (
    <Card className="w-full border-accent/20 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>{emoji}</span>
          <span>{title}</span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            2025 年真实录取数据 · {new Date().toLocaleDateString('zh-CN')}
          </span>
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {[
            { label: '分数', value: `${candidate.score} 分` },
            { label: '选科', value: subjectLabel },
            { label: '方向', value: candidate.major },
            { label: '地区', value: candidate.region },
          ].map(({ label, value }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </span>
          ))}
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="space-y-5 pt-5">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            综合概述
          </h3>
          <p className="text-sm leading-relaxed">{overview}</p>
        </div>

        <Separator />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              推荐院校
            </h3>
            <span className="text-xs text-muted-foreground">录取最低分 / 分差</span>
          </div>
          <div className="mt-3 space-y-3">
            {grouped.map(({ tier, items }) => (
              <div key={tier}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {sectionLabels[tier]}
                </p>
                <div className="space-y-2">
                  {items.map((rec) => (
                    <SchoolRow key={`${rec.name}-${rec.minScore}`} rec={rec} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            填报建议
          </h3>
          <ul className="space-y-2">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-accent">💡</span>
                <span className="leading-relaxed text-muted-foreground">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
