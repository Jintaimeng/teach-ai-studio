export interface SchoolScoreRecord {
    _id?: string;
    year: number;
    schoolCode: string;
    schoolName: string;
    schoolCodeName?: string;
    provinceCode?: string;
    provinceName?: string;
    provinceCodeName?: string;
    level?: string;
    subjectCode: string;
    subjectName: string;
    subjectCodeName?: string;
    college?: string;
    studyForm?: string;
    applicants?: number | string;
    firstChoiceAdmissions?: number;
    adjustedAdmissions?: number;
    lowestScore?: number;
    averageScore?: number;
    highestScore?: number;
    adjustedLowestScore?: number;
    adjustedAverageScore?: number;
    adjustedHighestScore?: number;
    remarks?: string;
    adjustedRemarks?: string;
    totalAdmissions?: number;
    school?: {
        name?: string;
        schoolCode?: string;
        is985?: boolean;
        is211?: boolean;
        isDual_class?: string | boolean;
        level?: string;
        type?: string;
        rank?: number;
    };
}
export interface SchoolScoreList {
    list: SchoolScoreRecord[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
    appliedFilters?: Record<string, unknown>;
    ignored?: string[];
}
export declare class YanbotApiError extends Error {
    statusCode: number;
    code?: number;
    constructor(message: string, statusCode: number, code?: number);
}
export declare function isYanbotConfigured(): boolean;
/** 主查询：院校专业历年录取分数 */
export declare function querySchoolScore(params: Record<string, string | number | boolean | undefined>): Promise<SchoolScoreList>;
/** 可用年份（降序） */
export declare function getYears(): Promise<number[]>;
/** 院校层次枚举（双一流/211/985/...） */
export declare function getLevels(year?: number): Promise<string[]>;
