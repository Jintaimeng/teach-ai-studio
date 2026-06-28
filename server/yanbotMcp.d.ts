/** 懒初始化会话（并发去重） */
export declare function ensureMcpReady(): Promise<void>;
/** 调用 MCP 工具，解析 result.content[0].text 为 JSON */
export declare function callTool<T = any>(tool: string, args?: Record<string, unknown>): Promise<T>;
export interface FeedItem {
    _id: string;
    title?: string;
    link?: string;
    isoDate?: string;
    tags?: string[];
    feedMeta?: {
        title?: string;
    };
    content?: string;
    contentSnippet?: string;
    summary?: string;
    [key: string]: unknown;
}
export interface FeedList {
    list: FeedItem[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}
/** 查询资讯列表 */
export declare function queryFeeds(params?: {
    keyword?: string;
    page?: number;
    pageSize?: number;
    fields?: string[];
    taskIds?: string[];
}): Promise<FeedList>;
/** 资讯聚合统计 */
export declare function aggregateFeeds(params?: Record<string, unknown>): Promise<any>;
export interface SchoolScoreRecord {
    _id?: string;
    year?: number;
    schoolCode?: string;
    schoolName?: string;
    provinceName?: string;
    level?: string;
    subjectCode?: string;
    subjectName?: string;
    college?: string;
    studyForm?: string;
    applicants?: number | string;
    firstChoiceAdmissions?: number;
    adjustedAdmissions?: number;
    lowestScore?: number;
    averageScore?: number;
    highestScore?: number;
    remarks?: string;
    [key: string]: unknown;
}
export interface SchoolScoreList {
    list: SchoolScoreRecord[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}
/** 查询院校专业历年录取分数线 */
export declare function querySchoolScores(params?: {
    schoolName?: string;
    subjectName?: string;
    subjectCode?: string;
    year?: number;
    level?: string;
    studyForm?: string;
    minLowestScore?: number;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}): Promise<SchoolScoreList>;
/** 可用年份（降序） */
export declare function listScoreYears(): Promise<number[]>;
/** 院校层次枚举 */
export declare function listScoreLevels(): Promise<string[]>;
/**
 * 按 id 取资讯完整内容（用于喂模型）。
 * 优先拉取一批带正文字段的资讯，再按 _id 过滤；保持入参顺序。
 */
export declare function getFeedsByIds(ids: string[]): Promise<FeedItem[]>;
