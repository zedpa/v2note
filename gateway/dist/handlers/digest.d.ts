/**
 * Digest Tier1 — 实时 Strike 分解
 *
 * 每条记录 1 次 AI 调用：分解为 Strike + 内部 Bond。
 * 跨 Strike 关系由 Tier2 批量分析统一处理。
 */
/**
 * Main digest entry point.
 * Tier1: 1 次 AI 调用分解 Strike + 内部 Bond。
 */
export declare function digestRecords(recordIds: string[], context: {
    deviceId: string;
    userId?: string;
}): Promise<void>;
