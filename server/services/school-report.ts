import { fetchRows, pickTier, type RecRow } from './report-data.js';
import type { SchoolRec, Tier, VibeReport, VibeReportInput } from './report-types.js';

/**
 * 择校报告生成逻辑。
 * 取数已改为参考 recommend 模块：通过 yanbot 开放接口的「一志愿」录取分数
 * （lowestScore）检索考研院校专业，按冲/稳/保分层。纯数据驱动，无 LLM。
 */

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

function buildReason(row: RecRow, diff: number, tier: Tier): string {
  const parts: string[] = [];
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
  const subjectLabel = row.subjectName ? `「${row.subjectName}」专业` : '该专业';

  if (tier === '冲') {
    parts.push(
      `${subjectLabel}一志愿录取最低分 ${row.minScore} 分，您低 ${Math.abs(diff)} 分，属于冲刺目标，需认真备考并准备调剂预案`
    );
  } else if (tier === '稳') {
    parts.push(`${subjectLabel}一志愿录取最低分 ${row.minScore} 分（分差 ${diffStr}），分数契合度高，上岸把握较大`);
  } else {
    parts.push(`${subjectLabel}一志愿录取最低分 ${row.minScore} 分，您高 ${diff} 分，可作为稳妥保底选择`);
  }

  if (row.is985) parts.push('985 重点院校');
  else if (row.is211) parts.push('211 重点院校');
  else if (row.isDualClass) parts.push('双一流院校');

  if (row.college) parts.push(`招生院系：${row.college}`);
  if (row.location) parts.push(`位于${row.location}`);

  return parts.join('；');
}

export async function generateVibeReport(input: VibeReportInput): Promise<VibeReport> {
  const { score, majorKeywords, regionPrefs, level } = input;

  // 一志愿录取最低分覆盖冲/稳/保区间：minScore ∈ [score-40, score+30]
  let rows = await fetchRows(input, { track: 'first', minScore: score - 40, maxScore: score + 30 });

  // 结果过少时放宽专业关键词
  let relaxed = false;
  if (rows.length < 9 && majorKeywords?.length) {
    relaxed = true;
    rows = await fetchRows(
      { ...input, majorKeywords: undefined },
      { track: 'first', minScore: score - 40, maxScore: score + 30 }
    );
  }

  const recs: SchoolRec[] = [
    ...pickTier(rows, score, '冲', 2, TIER_RANGE['冲'], TIER_MID['冲'], buildReason),
    ...pickTier(rows, score, '稳', 3, TIER_RANGE['稳'], TIER_MID['稳'], buildReason),
    ...pickTier(rows, score, '保', 2, TIER_RANGE['保'], TIER_MID['保'], buildReason),
  ];

  const majorLabel = majorKeywords?.length ? `${majorKeywords.join('、')}` : '综合方向';
  const regionLabel = regionPrefs?.length ? regionPrefs.join('、') : '全国';
  const levelLabel = level || '不限';
  const relaxNote = relaxed ? '（专业方向已适当放宽以保证推荐数量）' : '';

  const overview =
    `根据 yanbot 考研院校专业历年录取数据，为您生成择校报告${relaxNote}。` +
    `结合您的初试总分 ${score} 分（意向专业：${majorLabel}，地区偏好：${regionLabel}，院校层次：${levelLabel}），` +
    `共推荐 ${recs.length} 所院校（含冲 ${recs.filter((r) => r.tier === '冲').length} 所、` +
    `稳 ${recs.filter((r) => r.tier === '稳').length} 所、` +
    `保 ${recs.filter((r) => r.tier === '保').length} 所），分数均来自真实一志愿录取数据。`;

  const tips = [
    `本报告基于历年一志愿录取最低分，仅供参考。各院校复试线与录取线每年有浮动，建议结合近三年趋势综合判断`,
    `冲类院校竞争激烈，建议同时关注调剂政策与同层次保底院校；同一院校不同院系/方向分差可达 20-40 分，报考时注意细分方向选择`,
    `初试成绩之外，务必重视复试占比与单科线（政治/英语/专业课）要求，提前了解目标院校复试细则`,
    `跨专业或跨区域报考建议尽早联系导师、收集真题与参考书目，信息差往往决定上岸概率`,
  ];

  return {
    kind: 'zhaixiao',
    candidate: {
      score,
      major: majorLabel,
      region: regionLabel,
      level: levelLabel,
    },
    overview,
    recs,
    tips,
  };
}
