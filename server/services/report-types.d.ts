/** 志愿填报报告共享类型（择校报告 / 调剂报告复用同一结构）。 */
export type Tier = '冲' | '稳' | '保';
export interface SchoolRec {
    tier: Tier;
    name: string;
    location: string;
    badge: string;
    minScore: number;
    scoreDiff: number;
    reason: string;
}
export interface VibeReport {
    candidate: {
        score: number;
        subjectGroup: 'physics' | 'history';
        major: string;
        region: string;
    };
    overview: string;
    recs: SchoolRec[];
    tips: string[];
    /** 报告类型，前端据此展示标题等。 */
    kind?: 'zhaixiao' | 'tiaoji';
}
/** admissions LEFT JOIN schools 的行结构。 */
export interface DbRow {
    school_name: string;
    school_city: string | null;
    school_owner: string | null;
    major_name: string;
    min_score: number;
    is_985: number | null;
    is_211: number | null;
    province_text: string | null;
    rank: number | null;
}
export interface VibeReportInput {
    score: number;
    subjectGroup: 'physics' | 'history';
    majorKeywords?: string[];
    regionPrefs?: string[];
}
export declare function buildTags(row: DbRow): string[];
