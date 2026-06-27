/**
 * 考生描述解析（客户端）。
 * 适配考研场景：提取初试总分、报考专业、目标地区、院校层次。
 */

export interface CandidateContext {
  /** 考研初试总分 */
  score?: number;
  majorKeywords?: string[];
  region?: string;
  /** 院校层次：双一流 / 211 / 985 / 不限 */
  level?: string;
}

const MAJOR_KEYWORDS: [RegExp, string[]][] = [
  [/计算机|软件|人工智能|ai|算法/i, ['计算机']],
  [/金融|证券|银行|投资/i, ['金融']],
  [/法律|法学/i, ['法学']],
  [/教育|师范/i, ['教育']],
  [/心理/i, ['心理']],
  [/新闻|传媒|传播|广告/i, ['新闻', '传播']],
  [/管理|工商|mba/i, ['管理']],
  [/电子|通信/i, ['电子', '通信']],
  [/机械|自动化/i, ['机械', '自动化']],
  [/数学|统计/i, ['数学', '统计']],
  [/英语|外语/i, ['英语']],
  [/经济/i, ['经济']],
  [/会计|审计/i, ['会计']],
  [/化工|化学/i, ['化工', '化学']],
  [/医学|临床|护理/i, ['临床医学', '护理']],
  [/土木|建筑|建工/i, ['土木', '建筑']],
  [/物理/i, ['物理']],
  [/生物|生命/i, ['生物']],
  [/材料/i, ['材料']],
  [/环境/i, ['环境']],
  [/汉语|中文|文学/i, ['汉语', '文学']],
  [/历史/i, ['历史']],
  [/地理/i, ['地理']],
  [/政治|行政/i, ['政治', '行政']],
];

const REGIONS = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '武汉',
  '成都', '西安', '长沙', '重庆', '天津', '郑州', '合肥',
  '厦门', '大连', '哈尔滨', '沈阳', '济南', '青岛', '苏州',
  '宁波', '福州', '昆明', '贵阳', '南昌', '太原', '石家庄',
  '江苏', '浙江', '广东', '山东', '河南', '河北', '湖北', '湖南',
  '四川', '陕西', '福建', '安徽', '辽宁', '吉林', '黑龙江',
  '内蒙古', '广西', '新疆', '西藏', '海南', '云南', '贵州', '江西', '山西', '甘肃', '宁夏', '青海',
];

/** 从文本中识别院校层次。 */
function parseLevel(text: string): string | undefined {
  if (/985/.test(text)) return '985';
  if (/211/.test(text)) return '211';
  if (/双一流|一流大学|一流学科/.test(text)) return '双一流';
  if (/不限|都行|无所谓/.test(text)) return '不限';
  return undefined;
}

export function parseContext(text: string): CandidateContext {
  const ctx: CandidateContext = {};

  // 优先匹配「XXX 分」，其次匹配独立 3 位数（排除 985/211 等层次干扰），考研总分范围约 100-500
  const withUnit = text.match(/(\d{2,3})\s*分/);
  if (withUnit) {
    const n = parseInt(withUnit[1]);
    if (n >= 100 && n <= 500) ctx.score = n;
  }
  if (ctx.score == null) {
    const m = text.match(/\b(\d{3})\b/g);
    if (m) {
      for (const raw of m) {
        const n = parseInt(raw);
        if (n === 985 || n === 211) continue; // 院校层次，非分数
        if (n >= 240 && n <= 500) {
          ctx.score = n;
          break;
        }
      }
    }
  }

  const keywords: string[] = [];
  for (const [pattern, kws] of MAJOR_KEYWORDS) {
    if (pattern.test(text)) {
      keywords.push(...kws);
      break;
    }
  }
  if (keywords.length) ctx.majorKeywords = keywords;

  if (/不限|全国/.test(text)) {
    ctx.region = '不限';
  } else {
    for (const r of REGIONS) {
      if (text.includes(r)) {
        ctx.region = r;
        break;
      }
    }
  }

  const level = parseLevel(text);
  if (level) ctx.level = level;

  return ctx;
}
