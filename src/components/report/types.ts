/** 报告共享类型（与后端 server/services/report-types.ts 对应）。 */

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
  kind?: 'zhaixiao' | 'tiaoji';
}
