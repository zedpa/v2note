import { type MemoryEntry } from "./long-term.js";
import type { ContextMode } from "../context/tiers.js";
/**
 * MemoryManager combines short-term (session) and long-term (Supabase) memory.
 *
 * Mem0-inspired two-stage approach:
 * 1. Extract candidate facts from content
 * 2. For each candidate, retrieve similar memories and decide: ADD/UPDATE/DELETE/NONE
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
    }, userId?: string): Promise<string[]>;
    /**
     * Load relevance-filtered memories using the context loader.
     */
    loadRelevantContext(deviceId: string, opts?: {
        mode?: ContextMode;
        inputText?: string;
        dateRange?: {
            start: string;
            end: string;
        };
        localSoul?: string;
        userId?: string;
    }): Promise<{
        soul?: string;
        userProfile?: string;
        memories: string[];
        rawMemories: MemoryEntry[];
    }>;
    /**
     * Semantic memory search.
     * Falls back to keyword-based loading if embeddings unavailable.
     */
    searchMemories(deviceId: string, query: string, limit?: number, userId?: string): Promise<Array<{
        content: string;
        score: number;
        source_date: string | null;
    }>>;
    addShortTerm(content: string): void;
    /** 每用户记忆上限。超出时自动淘汰最低重要性的记忆。 */
    static readonly MAX_MEMORIES_PER_USER = 500;
    /**
     * Mem0 two-stage memory management:
     * 1. AI extracts candidate facts from content
     * 2. For each candidate, embedding-retrieve top-5 similar memories
     * 3. AI decides in one call: ADD / UPDATE(id) / DELETE(id) / NONE
     * 4. Execute decisions（含上限淘汰）
     */
    maybeCreateMemory(deviceId: string, content: string, date: string, userId?: string): Promise<void>;
    clearShortTerm(): void;
}
