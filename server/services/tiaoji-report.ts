import { fetchRows, pickTier, type RecRow } from './report-data.js';
import type { SchoolRec, Tier, VibeReport, VibeReportInput } from './report-types.js';

/**
 * 调剂报告生成逻辑。
 * 取数已改为参考 recommend 模块：通过 yanbot 开放接口的「调剂」录取分数
 * （adjustedLowestScore）检索接收调剂的考研院校专业，按冲/稳/保分层。
 *
 * 档位语义（均以「考生分数 - 院校调剂最低分」= scoreDiff 衡量）：
 *   冲（可冲调剂）：分差较小，处于调剂线边缘，需积极联系院校、关注缺额
 *   稳（稳妥调剂）：分差适中，调剂把握较大
 *   保（保底调剂）：分差较大，作为兜底，避免无书可读
 */

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

function buildReason(row: RecRow, diff: number, tier: Tier): string {
  const parts: string[] = [];
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
  const subjectLabel = row.subjectName ? `「${row.subjectName}」专业` : '该专业';

  if (tier === '冲') {
    parts.push(
      `${subjectLabel}调剂录取最低分 ${row.minScore} 分，分差 ${diffStr}，处于调剂线边缘，建议尽早联系院校并关注缺额公告以提高调剂成功率`
    );
  } else if (tier === '稳') {
    parts.push(`${subjectLabel}调剂录取最低分 ${row.minScore} 分，您高 ${diff} 分，调剂把握较大，可作为重点目标`);
  } else {
    parts.push(`${subjectLabel}调剂录取最低分 ${row.minScore} 分，您高 ${diff} 分，调剂成功概率高，适合兜底防止无书可读`);
  }

  if (row.is985) parts.push('985 重点院校');
  else if (row.is211) parts.push('211 重点院校');
  else if (row.isDualClass) parts.push('双一流院校');

  if (row.college) parts.push(`招生院系：${row.college}`);
  if (row.location) parts.push(`位于${row.location}`);

  return parts.join('；');
}

export async function generateTiaojiReport(input: VibeReportInput): Promise<VibeReport> {
  const { score, majorKeywords, regionPrefs, level } = input;

  // 调剂关注「分数已过线 / 略低」的院校：调剂最低分 ∈ [score-55, score+8]
  let rows = await fetchRows(input, { track: 'adjust', minScore: score - 55, maxScore: score + 8 });

  let relaxed = false;
  if (rows.length < 9 && majorKeywords?.length) {
    relaxed = true;
    rows = await fetchRows(
      { ...input, majorKeywords: undefined },
      { track: 'adjust', minScore: score - 55, maxScore: score + 8 }
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
    `根据 yanbot 考研院校专业历年调剂录取数据，为您生成调剂报告${relaxNote}。` +
    `结合您的初试总分 ${score} 分（意向专业：${majorLabel}，地区偏好：${regionLabel}，院校层次：${levelLabel}），` +
    `已筛选出具备调剂录取机会的院校专业组合，` +
    `共推荐 ${recs.length} 所院校（含可冲 ${recs.filter((r) => r.tier === '冲').length} 所、` +
    `稳妥 ${recs.filter((r) => r.tier === '稳').length} 所、` +
    `保底 ${recs.filter((r) => r.tier === '保').length} 所）。建议优先关注稳妥与保底档，确保有书可读。`;

  const tips = [
    `调剂录取线常与一志愿复试线接近甚至更高，本报告基于历年调剂录取最低分测算，仅供参考`,
    `调剂讲究「快、准、广」：开放调剂系统后第一时间填报，多联系导师与研招办，关注各校缺额公告与开放时间节点`,
    `保底档建议至少保留 2-3 所分差 26 分以上的院校，避免因复试名额已满或单科线不达标而错失机会`,
    `若对专业有明确要求，可适当下沉院校层次换取理想专业方向；反之可接受调剂换取更高院校平台`,
  ];

  return {
    kind: 'tiaoji',
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

export { TIER_DESC as TIAOJI_TIER_DESC };
