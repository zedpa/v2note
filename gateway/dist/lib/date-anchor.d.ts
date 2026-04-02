/**
 * 共享时间锚点 — 预计算常用相对日期，嵌入 LLM prompt。
 * LLM 直接查表，禁止自行做日期算术。
 */
export declare function fmt(d: Date): string;
/**
 * 生成预计算时间锚点查找表（Markdown 格式），嵌入 LLM prompt。
 *
 * 规则：
 * - "周末" → 本周日；若今天已是周日 → 下周日
 * - "这周六" → 本周六；若今天已过周六 → 下周六
 * - "下周X" → 下一个自然周的周X
 */
export declare function buildDateAnchor(referenceDate?: Date): string;
