/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 *
 * v2.1: 接入 loadWarmContext + buildSystemPrompt 架构
 * - Soul 完整注入（不截断）
 * - UserAgent 通知偏好检查
 * - Memory/Wiki 注入
 * - 早报新增目标脉搏（goal_pulse）
 * - 晚报新增日记洞察（insight）和每日肯定（affirmation）
 */
/** pg 驱动对 timestamp 列返回 Date 对象，安全转为本地日期字符串（Asia/Shanghai） */
export declare function toLocalDateStr(v: unknown): string | null;
export interface BriefingResult {
    greeting: string;
    today_focus: string[];
    carry_over: string[];
    goal_pulse: Array<{
        title: string;
        progress: string;
    }>;
    stats: {
        yesterday_done: number;
        yesterday_total: number;
    };
}
export interface SummaryResult {
    headline: string;
    accomplishments: string[];
    insight: string;
    affirmation: string;
    tomorrow_preview: string[];
    stats: {
        done: number;
        new_records: number;
    };
}
export declare function isBriefingDisabled(userId: string | undefined, type: "晨间简报" | "晚间回顾"): Promise<boolean>;
export declare function generateMorningBriefing(deviceId: string, userId?: string, forceRefresh?: boolean): Promise<BriefingResult | null>;
export declare function generateEveningSummary(deviceId: string, userId?: string, forceRefresh?: boolean): Promise<SummaryResult | null>;
