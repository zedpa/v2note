/**
 * Ingest Pipeline（Phase 2 — 认知 Wiki）
 *
 * 简化后的 digest 流程：
 * - 1 次 AI 调用提取 intend（待办/目标），不再拆解 Strike/Bond
 * - 生成 record-level embedding（整条文本向量化）
 * - 生成 content_hash（SHA256）
 * - Record 标记为 pending_compile（等待每日 Wiki 编译）
 * - 保留 Memory/Soul/Profile 更新
 */
/**
 * Main digest entry point.
 * Phase 2: 只提取 intend + 标记 pending_compile，不再拆解 Strike/Bond。
 */
export declare function digestRecords(recordIds: string[], context: {
    deviceId: string;
    userId?: string;
}): Promise<void>;
