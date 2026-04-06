/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 *
 * v2 简化版：精简 prompt，移除认知报告/视角轮换/转达/目标等复杂逻辑
 */
/** pg 驱动对 timestamp 列返回 Date 对象，需安全转为 string 以支持 startsWith 筛选 */
export declare function toDateString(v: unknown): string | null;
export interface BriefingResult {
    greeting: string;
    today_focus: string[];
    carry_over: string[];
    stats: {
        yesterday_done: number;
        yesterday_total: number;
    };
}
export interface SummaryResult {
    headline: string;
    accomplishments: string[];
    tomorrow_preview: string[];
    stats: {
        done: number;
        new_records: number;
    };
}
export declare function generateMorningBriefing(deviceId: string, userId?: string, forceRefresh?: boolean): Promise<BriefingResult>;
export declare function generateEveningSummary(deviceId: string, userId?: string, forceRefresh?: boolean): Promise<SummaryResult>;
