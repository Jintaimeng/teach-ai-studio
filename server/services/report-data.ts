import { querySchoolScore, type SchoolScoreRecord } from '../yanbotClient.js';
import type { SchoolRec, Tier, VibeReportInput } from './report-types.js';

/**
 * 报告取数层 —— 参考 recommend 模块（server/index.ts 的 runRecommendation），
 * 统一通过 yanbot 开放接口 querySchoolScore 获取考研院校专业历年录取分数，
 * 取代原先的本地 sql.js 查询。
 *
 * 两路取数：
 *   - 'first'  一志愿：按 lowestScore 过滤/排序，对应「择校报告」
 *   - 'adjust' 调剂：  按 adjustedLowestScore 过滤/排序，对应「调剂报告」
 */

/** 归一化后的候选行，供 pickTier 使用。 */
export interface RecRow {
  schoolName: string;
  location: string;
  subjectName: string;
  college?: string;
  /** 录取最低分（依 track 取 lowestScore 或 adjustedLowestScore） */
  minScore: number;
  is985: boolean;
  is211: boolean;
  isDualClass: boolean;
  level?: string;
  rank: number;
}

export type Track = 'first' | 'adjust';

function tagsOf(r: SchoolScoreRecord): { is985: boolean; is211: boolean; isDualClass: boolean } {
  const s = r.school;
  const level = (r.level || s?.level || '').toString();
  return {
    is985: Boolean(s?.is985) || /985/.test(level),
    is211: Boolean(s?.is211) || /211/.test(level),
    isDualClass: Boolean(s?.isDual_class) || /双一流/.test(level),
  };
}

export interface FetchOptions {
  track: Track;
  /** 院校录取最低分查询下限 */
  minScore?: number;
  /** 院校录取最低分查询上限 */
  maxScore?: number;
  pageSize?: number;
}

/** 调用 yanbot 开放接口并归一化为 RecRow[]。 */
export async function fetchRows(input: VibeReportInput, opts: FetchOptions): Promise<RecRow[]> {
  const subjectName = input.majorKeywords?.length ? input.majorKeywords[0] : undefined;
  const provinceName = input.regionPrefs?.length ? input.regionPrefs[0] : undefined;
  const level = input.level && input.level !== '不限' ? input.level : undefined;

  const common: Record<string, string | number | boolean | undefined> = {
    subjectName,
    provinceName,
    level,
    includeSchool: true,
  };

  const pageSize = opts.pageSize ?? 40;
  const useAdjusted = opts.track === 'adjust';

  const data = useAdjusted
    ? await querySchoolScore({
        ...common,
        hasAdjustment: true,
        minAdjustedLowestScore: opts.minScore,
        maxAdjustedLowestScore: opts.maxScore,
        sortBy: 'adjustedLowestScore',
        sortOrder: 'desc',
        pageSize,
      })
    : await querySchoolScore({
        ...common,
        hasFirstChoice: true,
        minLowestScore: opts.minScore,
        maxLowestScore: opts.maxScore,
        sortBy: 'lowestScore',
        sortOrder: 'desc',
        pageSize,
      });

  const list = data.list || [];
  const rows: RecRow[] = [];
  for (const r of list) {
    const score = useAdjusted ? r.adjustedLowestScore : r.lowestScore;
    if (typeof score !== 'number') continue;
    rows.push({
      schoolName: r.schoolName,
      location: r.provinceName || '',
      subjectName: r.subjectName,
      college: r.college,
      minScore: score,
      level: r.level || r.school?.level,
      rank: r.school?.rank ?? 9999,
      ...tagsOf(r),
    });
  }
  return rows;
}

/** 院校标签徽章。 */
export function buildBadge(row: RecRow): string {
  const tags: string[] = [];
  if (row.is985) tags.push('985');
  if (row.is211) tags.push('211');
  if (row.isDualClass && !row.is985 && !row.is211) tags.push('双一流');
  return tags.slice(0, 2).join('/') || '普通院校';
}

/**
 * 在候选行中按档位（冲/稳/保）打分排序并挑选 count 所院校。
 * 与原本地实现一致的权重逻辑：985/211/双一流 加权，越靠近档位中值越优，rank 越靠前越优。
 */
export function pickTier(
  rows: RecRow[],
  score: number,
  tier: Tier,
  count: number,
  range: [number, number],
  mid: number,
  reasonFn: (row: RecRow, diff: number, tier: Tier) => string
): SchoolRec[] {
  const [lo, hi] = range;

  const candidates = rows.filter((r) => {
    const d = score - r.minScore;
    return d >= lo && d <= hi;
  });

  const scored = candidates.map((r) => {
    const diff = score - r.minScore;
    let w = 0;
    if (r.is985) w += 3;
    else if (r.is211) w += 1.5;
    else if (r.isDualClass) w += 1;
    w -= Math.abs(diff - mid) * 0.08;
    w -= r.rank * 0.001;
    return { row: r, diff, w };
  });

  scored.sort((a, b) => b.w - a.w);

  const seen = new Set<string>();
  const result: SchoolRec[] = [];
  for (const { row, diff } of scored) {
    if (result.length >= count) break;
    const key = `${row.schoolName}-${row.subjectName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      tier,
      name: row.schoolName,
      location: row.location,
      badge: buildBadge(row),
      minScore: row.minScore,
      scoreDiff: diff,
      reason: reasonFn(row, diff, tier),
    });
  }
  return result;
}
