/**
 * Daily cognitive cycle — Wiki 编译 + 认知报告
 *
 * v3: Strike/Bond/Cluster 引擎已移除。
 *     每日流程：周期任务 → Wiki 编译 → 认知报告 → AI 日记
 */
import { type CompileResult } from "./wiki-compiler.js";
import { type CognitiveReport } from "./report.js";
export interface CognitiveCycleResult {
    wikiCompile: CompileResult | null;
    report: CognitiveReport | null;
    recurringInstances: number;
}
export declare function runDailyCognitiveCycle(userId: string, opts?: {
    deviceId?: string;
}): Promise<CognitiveCycleResult>;
