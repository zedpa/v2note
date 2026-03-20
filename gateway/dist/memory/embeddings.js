/**
 * Embedding-based semantic memory search (Mem0-inspired).
 *
 * Uses DashScope's text-embedding API for vector similarity search.
 * Enhances the existing keyword-based relevance scoring with semantic matching.
 *
 * Design: runs alongside the existing keyword-based system as an optional
 * enhancement. Falls back gracefully if embedding API is unavailable.
 */
// In-memory embedding cache (avoid re-embedding the same text)
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 500;
/**
 * Get embedding vector for text using DashScope API.
 */
export async function getEmbedding(text) {
    // Check cache
    const cacheKey = text.slice(0, 200); // truncate key
    const cached = embeddingCache.get(cacheKey);
    if (cached)
        return cached;
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const baseUrl = process.env.AI_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    if (!apiKey)
        throw new Error("DASHSCOPE_API_KEY not set");
    const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: process.env.EMBEDDING_MODEL ?? "text-embedding-v3",
            input: text.slice(0, 2000), // API limit
            dimensions: 1024,
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
        throw new Error(`Embedding API error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;
    if (!embedding)
        throw new Error("No embedding returned");
    // Cache (evict oldest if full)
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey !== undefined)
            embeddingCache.delete(firstKey);
    }
    embeddingCache.set(cacheKey, embedding);
    return embedding;
}
/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
}
/**
 * Semantic search over memory entries using embedding similarity.
 * Returns memories ranked by semantic relevance to the query.
 */
export async function semanticSearch(query, memories, limit = 10) {
    if (memories.length === 0)
        return [];
    const queryEmbedding = await getEmbedding(query);
    // Batch embed all memories (with concurrency control)
    const BATCH_SIZE = 10;
    const memoryEmbeddings = [];
    for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);
        const embeddings = await Promise.all(batch.map(async (m) => {
            try {
                const emb = await getEmbedding(m.content);
                return { memory: m, embedding: emb };
            }
            catch {
                return null;
            }
        }));
        for (const e of embeddings) {
            if (e)
                memoryEmbeddings.push(e);
        }
    }
    // Score and rank
    const scored = memoryEmbeddings.map(({ memory, embedding }) => ({
        ...memory,
        score: cosineSimilarity(queryEmbedding, embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}
/**
 * Check if a new memory is semantically similar to existing ones (dedup).
 * Returns the similar memory if found (similarity > threshold).
 */
export async function findSimilarMemory(newContent, existingMemories, threshold = 0.85) {
    try {
        const results = await semanticSearch(newContent, existingMemories, 1);
        if (results.length > 0 && results[0].score >= threshold) {
            return results[0];
        }
    }
    catch (err) {
        console.warn(`[embeddings] Similarity check failed: ${err.message}`);
    }
    return null;
}
/**
 * Check if embedding API is available.
 */
export async function isEmbeddingAvailable() {
    try {
        await getEmbedding("test");
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=embeddings.js.map