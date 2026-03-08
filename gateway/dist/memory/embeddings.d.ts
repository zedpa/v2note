/**
 * Embedding-based semantic memory search (Mem0-inspired).
 *
 * Uses DashScope's text-embedding API for vector similarity search.
 * Enhances the existing keyword-based relevance scoring with semantic matching.
 *
 * Design: runs alongside the existing keyword-based system as an optional
 * enhancement. Falls back gracefully if embedding API is unavailable.
 */
export interface SemanticSearchResult {
    id: string;
    content: string;
    score: number;
    source_date: string | null;
    importance: number;
}
/**
 * Semantic search over memory entries using embedding similarity.
 * Returns memories ranked by semantic relevance to the query.
 */
export declare function semanticSearch(query: string, memories: Array<{
    id: string;
    content: string;
    source_date: string | null;
    importance: number;
}>, limit?: number): Promise<SemanticSearchResult[]>;
/**
 * Check if a new memory is semantically similar to existing ones (dedup).
 * Returns the similar memory if found (similarity > threshold).
 */
export declare function findSimilarMemory(newContent: string, existingMemories: Array<{
    id: string;
    content: string;
    source_date: string | null;
    importance: number;
}>, threshold?: number): Promise<SemanticSearchResult | null>;
/**
 * Check if embedding API is available.
 */
export declare function isEmbeddingAvailable(): Promise<boolean>;
