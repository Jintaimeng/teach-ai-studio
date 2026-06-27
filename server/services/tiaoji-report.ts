import { queryAll } from '../yanbot-db.js';
import {
  buildTags,
  type DbRow,
  type SchoolRec,
  type Tier,
  type VibeReport,
  type VibeReportInput,
} from './report-types.js';

/**
 * 调剂报告生成逻辑（新建，非 yanbot-claw 原有功能）。
 *
 * 场景：考生分数已出 / 未被理想志愿录取，想了解「分数已过线、有较大录取或征集/调剂
 * 机会」的院校专业组合。复用与择校报告相同的 VibeReport 数据结构与 admissions 数据，
 * 但取数区间与档位偏向「正分差」（考生分数高于院校录取线），文案围绕调剂/征集志愿。
 *
 * 档位语义（均以「考生分数 - 院校最低分」= scoreDiff 衡量）：
 *   冲（可冲调剂）：分差较小，需服从专业调剂、关注缺额方可冲一冲
 *   稳（稳妥调剂）：分差适中，录取/调剂把握较大
 *   保（保底调剂）：分差较大，作为兜底，避免滑档
 */

const YEAR = 2025;
const PROVINCE = '河北';

const TIER_RANGE: Record<Tier, [number, number]> = {
  冲: [-8, 8],
  稳: [9, 25],
  保: [26, 55],
};

const TIER_MID: Record<Tier, number> = {
  冲: 0,
  稳: 17,
  保: 40,
};

const TIER_DESC: Record<Tier, string> = {
  冲: '可冲调剂',
  稳: '稳妥调剂',
  保: '保底调剂',
};

function buildReason(row: DbRow, diff: number, tier: Tier): string {
  const parts: string[] = [];
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

  if (tier === '冲') {
    parts.push(
      `2025年录取最低分 ${row.min_score} 分，分差 ${diffStr}，处于线上边缘，建议勾选「服从专业调剂」并关注招生缺额以提高录取概率`
    );
  } else if (tier === '稳') {
    parts.push(`2025年录取最低分 ${row.min_score} 分，您高 ${diff} 分，录取或调剂把握较大，可作为重点调剂目标`);
  } else {
    parts.push(`2025年录取最低分 ${row.min_score} 分，您高 ${diff} 分，调剂录取概率高，适合兜底防滑档`);
  }

  if (row.is_985) parts.push('985 重点院校');
  else if (row.is_211) parts.push('211 重点院校');

  const city = row.school_city ?? row.province_text;
  if (city) parts.push(`位于${city}`);

  return parts.join('；');
}

function queryRows(input: VibeReportInput): DbRow[] {
  const { score, subjectGroup, majorKeywords, regionPrefs } = input;

  const conditions: string[] = [
    'a.year = ?',
    'a.province = ?',
    'a.subject_group = ?',
    'a.min_score IS NOT NULL',
    // 调剂关注「分数已过线 / 略低」的院校：min_score 落在 [score-60, score+12]
    'a.min_score BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [YEAR, PROVINCE, subjectGroup, score - 60, score + 12];

  if (majorKeywords?.length) {
    conditions.push(`(${majorKeywords.map(() => 'a.major_name LIKE ?').join(' OR ')})`);
    params.push(...majorKeywords.map((kw) => `%${kw}%`));
  }

  if (regionPrefs?.length) {
    conditions.push(
      `(${regionPrefs.map(() => '(a.school_city LIKE ? OR s.province_text LIKE ?)').join(' OR ')})`
    );
    for (const r of regionPrefs) {
      params.push(`%${r}%`, `%${r}%`);
    }
  }

  const sql = `
    SELECT
      a.school_name, a.school_city, a.school_owner, a.major_name, a.min_score,
      s.is_985, s.is_211, s.province_text, s.rank
    FROM admissions a
    LEFT JOIN schools s ON a.school_ref_id = s.school_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.rank ASC NULLS LAST, a.min_score DESC
  `;

  return queryAll<DbRow>(sql, params);
}

function pickTier(rows: DbRow[], score: number, tier: Tier, count: number): SchoolRec[] {
  const [lo, hi] = TIER_RANGE[tier];
  const mid = TIER_MID[tier];

  const candidates = rows.filter((r) => {
    const d = score - r.min_score;
    return d >= lo && d <= hi;
  });

  const scored = candidates.map((r) => {
    const diff = score - r.min_score;
    let w = 0;
    if (r.is_985) w += 3;
    else if (r.is_211) w += 1.5;
    w -= Math.abs(diff - mid) * 0.08;
    w -= (r.rank ?? 9999) * 0.001;
    return { row: r, diff, w };
  });

  scored.sort((a, b) => b.w - a.w);

  const seen = new Set<string>();
  const result: SchoolRec[] = [];
  for (const { row, diff } of scored) {
    if (result.length >= count) break;
    if (seen.has(row.school_name)) continue;
    seen.add(row.school_name);
    result.push({
      tier,
      name: row.school_name,
      location: row.school_city ?? row.province_text ?? '',
      badge: buildTags(row).slice(0, 2).join('/') || '普通本科',
      minScore: row.min_score,
      scoreDiff: diff,
      reason: buildReason(row, diff, tier),
    });
  }
  return result;
}

export function generateTiaojiReport(input: VibeReportInput): VibeReport {
  const { score, subjectGroup, majorKeywords, regionPrefs } = input;

  let rows = queryRows(input);

  let relaxed: string[] = [];
  if (rows.length < 9 && majorKeywords?.length) {
    relaxed = ['majorKeywords'];
    rows = queryRows({ ...input, majorKeywords: undefined });
  }

  const recs: SchoolRec[] = [
    ...pickTier(rows, score, '冲', 2),
    ...pickTier(rows, score, '稳', 3),
    ...pickTier(rows, score, '保', 2),
  ];

  const groupLabel = subjectGroup === 'physics' ? '物理' : '历史';
  const majorLabel = majorKeywords?.length ? `${majorKeywords.join('、')}` : '综合方向';
  const regionLabel = regionPrefs?.length ? regionPrefs.join('、') : '全国';
  const relaxNote = relaxed.length ? '（专业方向已适当放宽以保证推荐数量）' : '';

  const overview =
    `根据 2025 年${PROVINCE}省本科批${groupLabel}选科真实录取数据，为您生成调剂报告${relaxNote}。` +
    `结合您的 ${score} 分（意向专业：${majorLabel}，地区偏好：${regionLabel}），` +
    `已筛选出分数已过线、具备录取或征集/调剂机会的院校专业组合，` +
    `共推荐 ${recs.length} 所院校（含可冲 ${recs.filter((r) => r.tier === '冲').length} 所、` +
    `稳妥 ${recs.filter((r) => r.tier === '稳').length} 所、` +
    `保底 ${recs.filter((r) => r.tier === '保').length} 所）。建议优先关注稳妥与保底档，确保不滑档。`;

  const tips = [
    `调剂/征集志愿录取线常与首轮投档线接近甚至更高，本报告基于 2025 年${PROVINCE}省录取最低分测算，仅供参考`,
    `填报时务必勾选「服从专业调剂」，可显著降低退档风险；同时留意各校招生缺额公告与征集志愿时间节点`,
    `保底档建议至少保留 2-3 所分差 30 分以上的院校，避免因专业受限或体检/单科要求被退档`,
    `若对专业有明确要求，可适当下沉院校层次换取理想专业；反之可接受调剂以换取更高院校平台`,
  ];

  return {
    kind: 'tiaoji',
    candidate: {
      score,
      subjectGroup,
      major: majorLabel,
      region: regionLabel,
    },
    overview,
    recs,
    tips,
  };
}

export { TIER_DESC as TIAOJI_TIER_DESC };
