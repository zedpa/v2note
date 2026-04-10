/**
 * Async context loader with relevance-based filtering.
 *
 * Key design (borrowed from OpenClaw):
 * - Parallel loading of soul + memories via Promise.all
 * - Keyword-based relevance scoring (no vector DB needed)
 * - Mode-aware loading: chat loads more memories than briefing
 * - Returns pre-filtered, ranked context ready for prompt assembly
 */
import { type MemoryEntry } from "../memory/long-term.js";
import type { ContextMode } from "./tiers.js";
export interface LoadedContext {
    soul?: string;
    /** User profile (factual info, separated from soul) */
    userProfile?: string;
    /** UserAgent 内容（用户的规则/配置） */
    userAgent?: string;
    memories: string[];
    /** Raw memory entries (for downstream use like goal extraction) */
    rawMemories: MemoryEntry[];
    /** Active goals from goal table */
    goals: Array<{
        id: string;
        title: string;
    }>;
    /** Wiki page 上下文（title: summary 格式） */
    wikiContext?: string[];
}
/**
 * Load warm-tier context in parallel, with relevance filtering.
 */
export declare function loadWarmContext(opts: {
    deviceId: string;
    userId?: string;
    mode: ContextMode;
    inputText?: string;
    dateRange?: {
        start: string;
        end: string;
    };
    /** Pre-loaded soul content (from localConfig) */
    localSoul?: string;
}): Promise<LoadedContext>;
