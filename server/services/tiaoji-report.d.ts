import { type Tier, type VibeReport, type VibeReportInput } from './report-types.js';
declare const TIER_DESC: Record<Tier, string>;
export declare function generateTiaojiReport(input: VibeReportInput): VibeReport;
export { TIER_DESC as TIAOJI_TIER_DESC };
