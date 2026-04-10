/**
 * 单元测试：digest-prompt.ts — Phase 2 Ingest 改造
 *
 * 核心变更：buildDigestPrompt → buildIngestPrompt
 * - 只提取 intend（待办/目标），不生成 Strike/Bond
 * - 保留 dateAnchor 时间锚点
 * - 输出 JSON 结构只含 intends[]（domain 已移除）
 */
export {};
