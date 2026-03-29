/**
 * Tier2 批量分析引擎 — 单次 AI 调用替代多步管线
 *
 * 触发条件（OR 逻辑）：
 * - 累计 5 个新 Strike（digest 后检查）
 * - 每日 3AM 定时触发
 *
 * 替代：clustering + emergence + contradiction + promote + tag-sync
 */
export declare const TIER2_STRIKE_THRESHOLD = 5;
export interface BatchAnalyzeResult {
    success: boolean;
    strikeCount: number;
    newClusters: number;
    mergedClusters: number;
    bonds: number;
    contradictions: number;
    patterns: number;
    goals: number;
    supersedes: number;
}
export declare function runBatchAnalyze(userId: string): Promise<BatchAnalyzeResult>;
