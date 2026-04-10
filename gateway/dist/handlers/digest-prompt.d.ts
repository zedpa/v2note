/**
 * Prompts for the Ingest pipeline (Phase 2 — 认知 Wiki).
 *
 * - buildIngestPrompt: 只提取 intend 类型的待办/目标，不拆解 Strike/Bond
 * - domain 分配已移除（Phase 11: Wiki Page 统一组织层）
 */
/**
 * 构建 Ingest prompt — 指导 AI 从用户输入中提取 intend（待办/目标）。
 *
 * 不再生成 Strike/Bond 列表，不再分配 domain。
 * 输出 JSON 结构只含 intends[]。
 */
export declare function buildIngestPrompt(): string;
/**
 * 兼容旧调用方——内部转发到 buildIngestPrompt。
 * @deprecated 使用 buildIngestPrompt 替代
 */
export declare function buildDigestPrompt(): string;
