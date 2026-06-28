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
export interface FetchOptions {
    track: Track;
    /** 院校录取最低分查询下限 */
    minScore?: number;
    /** 院校录取最低分查询上限 */
    maxScore?: number;
    pageSize?: number;
}
/** 调用 yanbot 开放接口并归一化为 RecRow[]。 */
export declare function fetchRows(input: VibeReportInput, opts: FetchOptions): Promise<RecRow[]>;
/** 院校标签徽章。 */
export declare function buildBadge(row: RecRow): string;
/**
 * 在候选行中按档位（冲/稳/保）打分排序并挑选 count 所院校。
 * 与原本地实现一致的权重逻辑：985/211/双一流 加权，越靠近档位中值越优，rank 越靠前越优。
 */
export declare function pickTier(rows: RecRow[], score: number, tier: Tier, count: number, range: [number, number], mid: number, reasonFn: (row: RecRow, diff: number, tier: Tier) => string): SchoolRec[];
