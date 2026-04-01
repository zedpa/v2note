/**
 * Embedding-based semantic memory search (Mem0-inspired).
 *
 * Uses DashScope's text-embedding API for vector similarity search.
 * Enhances the existing keyword-based relevance scoring with semantic matching.
 *
 * 缓存架构（三级）：
 *   内存 LRU(100 条) → 磁盘文件(10 万条，重启不丢) → DashScope API
 */
import { getDiskEmbedding, setDiskEmbedding } from "../lib/disk-cache.js";
import { Semaphore } from "../lib/semaphore.js";
// 内存 LRU 缓存（热层，容量小，速度快）
const memCache = new Map();
const MAX_MEM_CACHE = 100;
// DashScope embedding 并发控制
const embeddingSemaphore = new Semaphore(30);
function memCacheSet(key, value) {
    // LRU：删除再插入，保证最新的在末尾
    memCache.delete(key);
    if (memCache.size >= MAX_MEM_CACHE) {
        const oldest = memCache.keys().next().value;
        if (oldest !== undefined)
            memCache.delete(oldest);
    }
    memCache.set(key, value);
}
/**
 * Get embedding vector for text using DashScope API.
 * 查找顺序：内存 LRU → 磁盘文件 → DashScope API → 回写两层
 */
export async function getEmbedding(text) {
    const cacheKey = text.slice(0, 200);
    // 1. 查内存
    const mem = memCache.get(cacheKey);
    if (mem) {
        // LRU touch：移到末尾
        memCache.delete(cacheKey);
        memCache.set(cacheKey, mem);
        return mem;
    }
    // 2. 查磁盘
    const disk = getDiskEmbedding(cacheKey);
    if (disk) {
        memCacheSet(cacheKey, disk);
        return disk;
    }
    // 3. 调用 DashScope API（带并发控制）
    return embeddingSemaphore.acquire(async () => {
        // double-check（可能在排队期间被其他请求缓存了）
        const recheck = memCache.get(cacheKey);
        if (recheck)
            return recheck;
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
                input: text.slice(0, 2000),
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
        // 回写两层缓存
        memCacheSet(cacheKey, embedding);
        setDiskEmbedding(cacheKey, embedding);
        return embedding;
    });
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