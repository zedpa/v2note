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
export declare function extractKeywords(text: string): Set<string>;
