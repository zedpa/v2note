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
export declare function extractKeywords(text: string): Set<string>;
