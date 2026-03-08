import { type MemoryEntry } from "./long-term.js";
import type { ContextMode } from "../context/tiers.js";
/**
 * MemoryManager combines short-term (session) and long-term (Supabase) memory.
 *
 * Enhanced with Mem0-inspired features:
 * - Semantic search via embeddings (optional, falls back to keyword-based)
 * - Automatic memory deduplication (prevents storing near-identical memories)
 * - Memory consolidation (merges related memories over time)
 */
export declare class MemoryManager {
    private shortTerm;
    /**
     * Load relevant memories for a session.
     * @deprecated Use loadRelevantContext() for new code — it supports relevance filtering.
     */
    loadContext(deviceId: string, dateRange?: {
        start: string;
        end: string;
    }): Promise<string[]>;
    /**
     * Load relevance-filtered memories using the context loader.
     * Returns both formatted strings and raw entries.
     */
    loadRelevantContext(deviceId: string, opts?: {
        mode?: ContextMode;
        inputText?: string;
        dateRange?: {
            start: string;
            end: string;
        };
        localSoul?: string;
    }): Promise<{
        soul?: string;
        memories: string[];
        rawMemories: MemoryEntry[];
    }>;
    /**
     * Semantic memory search (Mem0-style).
     * Falls back to keyword-based loading if embeddings unavailable.
     */
    searchMemories(deviceId: string, query: string, limit?: number): Promise<Array<{
        content: string;
        score: number;
        source_date: string | null;
    }>>;
    /**
     * Add to short-term memory.
     */
    addShortTerm(content: string): void;
    /**
     * After processing a record, use AI to decide if a long-term memory should be created.
     * Enhanced with Mem0-style deduplication: checks for similar existing memories
     * and updates instead of creating duplicates.
     */
    maybeCreateMemory(deviceId: string, content: string, date: string): Promise<void>;
    /**
     * Save memory with semantic deduplication (Mem0-inspired).
     * If a very similar memory exists, update it instead of creating a duplicate.
     */
    private saveWithDedup;
    clearShortTerm(): void;
}
