/**
 * Daily cognitive cycle — 3 步：批量分析 + 维护 + 报告
 *
 * v2: 从 8 步简化为 3 步，clustering/emergence/contradiction/promote/tag-sync
 *     全部由 batch-analyze 单次 AI 调用替代。
 */
import { type BatchAnalyzeResult } from "./batch-analyze.js";
import { type CognitiveReport } from "./report.js";
export interface CognitiveCycleResult {
    batchAnalyze: BatchAnalyzeResult | null;
    maintenance: {
        normalized: number;
        decayed: number;
        salience: number;
    } | null;
    report: CognitiveReport | null;
    recurringInstances: number;
}
export declare function runDailyCognitiveCycle(userId: string, opts?: {
    deviceId?: string;
}): Promise<CognitiveCycleResult>;
