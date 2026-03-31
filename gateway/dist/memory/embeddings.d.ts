/**
 * Embedding-based semantic memory search (Mem0-inspired).
 *
 * Uses DashScope's text-embedding API for vector similarity search.
 * Enhances the existing keyword-based relevance scoring with semantic matching.
 *
 * 缓存架构（三级）：
 *   内存 LRU(100 条) → 磁盘文件(10 万条，重启不丢) → DashScope API
 */
/**
 * Get embedding vector for text using DashScope API.
 * 查找顺序：内存 LRU → 磁盘文件 → DashScope API → 回写两层
 */
export declare function getEmbedding(text: string): Promise<number[]>;
/**
 * Compute cosine similarity between two vectors.
 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
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
