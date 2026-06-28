/** 志愿填报报告共享类型（择校报告 / 调剂报告复用同一结构）。
 *
 * 数据来源已由本地 sql.js（高考）切换为 yanbot 开放接口（考研院校专业历年录取分数），
 * 取数方式参考 recommend 模块（server/yanbotClient.ts）。
 */
export type Tier = '冲' | '稳' | '保';
export interface SchoolRec {
    tier: Tier;
    /** 院校名称 */
    name: string;
    /** 所在地区（provinceName） */
    location: string;
    /** 标签徽章，如 985/211/双一流 */
    badge: string;
    /** 录取最低分（择校=一志愿 lowestScore，调剂=adjustedLowestScore） */
    minScore: number;
    /** 考生分数 - 录取最低分 */
    scoreDiff: number;
    reason: string;
}
export interface VibeReport {
    candidate: {
        score: number;
        /** 意向专业（关键词归并） */
        major: string;
        /** 地区偏好 */
        region: string;
        /** 院校层次：双一流 / 211 / 985 / 不限 */
        level: string;
    };
    overview: string;
    recs: SchoolRec[];
    tips: string[];
    /** 报告类型，前端据此展示标题等。 */
    kind?: 'zhaixiao' | 'tiaoji';
}
export interface VibeReportInput {
    /** 考研初试总分 */
    score: number;
    /** 报考专业关键词 */
    majorKeywords?: string[];
    /** 目标地区 / 省份 */
    regionPrefs?: string[];
    /** 院校层次要求：双一流 / 211 / 985；不限则为 null/undefined */
    level?: string | null;
}
