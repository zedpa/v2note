/**
 * Async context loader with relevance-based filtering.
 *
 * Key design (borrowed from OpenClaw):
 * - Parallel loading of soul + memories via Promise.all
 * - Keyword-based relevance scoring (no vector DB needed)
 * - Mode-aware loading: process mode skips soul, chat loads more memories
 * - Returns pre-filtered, ranked context ready for prompt assembly
 */
import { type MemoryEntry } from "../memory/long-term.js";
import type { ContextMode } from "./tiers.js";
export interface LoadedContext {
    soul?: string;
    memories: string[];
    /** Raw memory entries (for downstream use like goal extraction) */
    rawMemories: MemoryEntry[];
}
/**
 * Load warm-tier context in parallel, with relevance filtering.
 */
export declare function loadWarmContext(opts: {
    deviceId: string;
    mode: ContextMode;
    inputText?: string;
    dateRange?: {
        start: string;
        end: string;
    };
    /** Pre-loaded soul content (from localConfig) */
    localSoul?: string;
}): Promise<LoadedContext>;
