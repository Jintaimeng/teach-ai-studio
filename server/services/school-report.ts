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
 * 择校报告生成逻辑。
 * 移植自 yanbot-claw/lib/services/school-report.ts，取数改为 sql.js 的 queryAll。
 * 纯数据驱动（2025 河北省本科批真实录取数据），无 LLM。
 */

const YEAR = 2025;
const PROVINCE = '河北';

const TIER_RANGE: Record<Tier, [number, number]> = {
  冲: [-30, -8],
  稳: [-7, 8],
  保: [9, 40],
};

const TIER_MID: Record<Tier, number> = {
  冲: -18,
  稳: 0,
  保: 22,
};

function buildReason(row: DbRow, diff: number, tier: Tier): string {
  const parts: string[] = [];
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

  if (tier === '冲') {
    parts.push(
      `2025年录取最低分 ${row.min_score} 分，您低 ${Math.abs(diff)} 分，属于冲刺志愿，需认真备考并准备调剂预案`
    );
  } else if (tier === '稳') {
    parts.push(`2025年录取最低分 ${row.min_score} 分（分差 ${diffStr}），分数契合度高，录取把握较大`);
  } else {
    parts.push(`2025年录取最低分 ${row.min_score} 分，您高 ${diff} 分，可作为保底选择`);
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
    'a.min_score BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [YEAR, PROVINCE, subjectGroup, score - 30, score + 40];

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

export function generateVibeReport(input: VibeReportInput): VibeReport {
  const { score, subjectGroup, majorKeywords, regionPrefs } = input;

  let rows = queryRows(input);

  // 结果过少时放宽专业关键词
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

  const level =
    score >= 620 ? '顶尖梯队'
    : score >= 570 ? '强势梯队'
    : score >= 530 ? '中上游'
    : score >= 490 ? '中游'
    : '中下游';

  const overview =
    `根据 2025 年${PROVINCE}省本科批${groupLabel}选科真实录取数据，` +
    `为您生成择校报告${relaxNote}。您的 ${score} 分在${groupLabel}选科中处于${level}水平，` +
    `意向专业：${majorLabel}，地区偏好：${regionLabel}。` +
    `共推荐 ${recs.length} 所院校（含冲 ${recs.filter((r) => r.tier === '冲').length} 所、` +
    `稳 ${recs.filter((r) => r.tier === '稳').length} 所、` +
    `保 ${recs.filter((r) => r.tier === '保').length} 所），分数均来自真实录取数据。`;

  const tips = [
    `本报告基于 2025 年${PROVINCE}省录取最低分，仅供参考。高考录取线每年有浮动，建议结合近三年趋势综合判断`,
    `冲类院校风险较高，建议同时关注调剂政策；${score >= 570 ? '985 院校' : '211 院校'}内部专业分差可达 20-40 分，填报时注意专业选择`,
    `平行志愿中，相同学校不同专业可拉开梯度，建议同一所"稳"类院校填 2-3 个专业梯度`,
    `提前批与特殊类型招生（如强基计划、综合评价）单独填报，不影响普通批次志愿，有意向的同学可提前了解`,
  ];

  return {
    kind: 'zhaixiao',
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
