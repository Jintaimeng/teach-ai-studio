import type { Tier, VibeReport, VibeReportInput } from './report-types.js';
declare const TIER_DESC: Record<Tier, string>;
export declare function generateTiaojiReport(input: VibeReportInput): Promise<VibeReport>;
export { TIER_DESC as TIAOJI_TIER_DESC };
