/**
 * Shared text utility functions.
 * Extracted from context/loader.ts for reuse across gateway modules.
 */
/** Chinese stopwords to exclude from keyword matching */
export declare const STOPWORDS: Set<string>;
/**
 * Extract keywords from Chinese/mixed text.
 * Uses character bigrams + word-level split for broad matching.
 */
/** Keywords indicating user is defining AI personality/behavior */
export declare const SOUL_KEYWORDS: string[];
/** Keywords indicating user is sharing personal/factual info */
export declare const PROFILE_KEYWORDS: string[];
/** Check if text likely contains soul-relevant content */
export declare function maySoulUpdate(text: string): boolean;
/** Check if text likely contains profile-relevant content */
export declare function mayProfileUpdate(text: string): boolean;
/**
 * 清理 AI 返回的 JSON 字符串：去除 markdown 代码块包裹、思考过程文本等。
 * DashScope qwen3 系列经常返回 ```json ... ``` 或 <think>...</think> 包裹的 JSON。
 */
export declare function cleanJsonResponse(raw: string): string;
/**
 * 安全解析 AI 返回的 JSON：先清理再解析。
 * 失败时返回 null 而不是抛异常。
 */
export declare function safeParseJson<T = any>(raw: string): T | null;
export declare function extractKeywords(text: string): Set<string>;
