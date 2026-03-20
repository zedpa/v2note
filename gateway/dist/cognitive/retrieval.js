/**
 * Hybrid retrieval module for cognitive engine.
 *
 * Combines semantic (embedding) and structured (tag/person/temporal/polarity)
 * channels to find relevant historical Strikes for a given new Strike.
 */
import { getEmbedding, cosineSimilarity } from "../memory/embeddings.js";
import { query } from "../db/pool.js";
import * as strikeRepo from "../db/repositories/strike.js";
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** Extract Chinese names (2-4 characters) from text. */
function extractChineseNames(text) {
    const matches = text.match(/(?:[\u8d75\u94b1\u5b59\u674e\u5468\u5434\u90d1\u738b\u51af\u9648\u891a\u536b\u848b\u6c88\u97e9\u6768\u6731\u79e6\u5c24\u8bb8\u4f55\u5415\u65bd\u5f20\u5b54\u66f9\u4e25\u534e\u91d1\u9b4f\u9676\u59dc\u621a\u8c22\u90b9\u55bb\u67cf\u6c34\u7aa6\u7ae0\u4e91\u82cf\u6f58\u845b\u595a\u8303\u5f6d\u90ce\u9c81\u97e6\u660c\u9a6c\u82d7\u51e4\u82b1\u65b9\u4fde\u4efb\u8881\u67f3\u9146\u9c8d\u53f2\u5510\u8d39\u5ec9\u5c91\u859b\u96f7\u8d3a\u502a\u6c64\u6ed5\u6bb7\u7f57\u6bd5\u90dd\u90ac\u5b89\u5e38\u4e50\u4e8e\u65f6\u5085\u76ae\u535e\u9f50\u5eb7\u4f0d\u4f59\u5143\u535c\u987e\u5b5f\u5e73\u9ec4\u548c\u7a46\u8427\u5c39\u59da\u90b5\u6e5b\u6c6a\u7941\u6bdb\u79b9\u72c4\u7c73\u8d1d\u660e\u81e7\u8ba1\u4f0f\u6210\u6234\u8c08\u5b8b\u8305\u5e9e\u718a\u7eaa\u8212\u5c48\u9879\u795d\u8463\u6881\u675c\u962e\u84dd\u95f5\u5e2d\u5b63\u9ebb\u5f3a\u8d3e\u8def\u5a04\u5371\u6c5f\u7ae5\u989c\u90ed\u6885\u76db\u6797\u5201\u949f\u5f90\u4e18\u9a86\u9ad8\u590f\u8521\u7530\u6a0a\u80e1\u51cc\u970d\u865e\u4e07\u652f\u67ef\u661d\u7ba1\u5362\u83ab\u7ecf\u623f\u88d8\u7f2a\u5e72\u89e3\u5e94\u5b97\u4e01\u5ba3\u8d32\u9093\u90c1\u5355\u676d\u6d2a\u5305\u8bf8\u5de6\u77f3\u5d14\u5409\u94ae\u9f9a\u7a0b\u5d47\u90a2\u6ed1\u88f4\u9646\u8363\u7fc1\u8340\u7f8a\u65bc\u60e0\u7504\u66f2\u5bb6\u5c01\u82ae\u7fbd\u50a8\u9773])[\u4e00-\u9fff]{1,3}/g);
    return matches ? [...new Set(matches)] : [];
}
async function semanticChannel(nucleus, activeStrikes, topK) {
    if (activeStrikes.length === 0)
        return [];
    const queryEmbedding = await getEmbedding(nucleus);
    const scored = [];
    for (const s of activeStrikes) {
        try {
            const emb = await getEmbedding(s.nucleus);
            scored.push({ strike: s, similarity: cosineSimilarity(queryEmbedding, emb) });
        }
        catch {
            // skip strikes that fail to embed
        }
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
}
// ---------------------------------------------------------------------------
// Channel B: Structured retrieval
// ---------------------------------------------------------------------------
/** B1: Strikes sharing tags with the new Strike. */
async function tagChannel(tags, userId, limit) {
    if (tags.length === 0)
        return [];
    const placeholders = tags.map((_, i) => `$${i + 2}`).join(", ");
    return query(`SELECT DISTINCT s.* FROM strike s
     JOIN strike_tag st ON st.strike_id = s.id
     WHERE s.user_id = $1 AND s.status = 'active'
       AND st.label IN (${placeholders})
     ORDER BY s.created_at DESC
     LIMIT $${tags.length + 2}`, [userId, ...tags, limit]);
}
/** B2: Strikes that share person-name tags extracted from nucleus. */
async function personChannel(nucleus, userId, limit) {
    const names = extractChineseNames(nucleus);
    if (names.length === 0)
        return [];
    const placeholders = names.map((_, i) => `$${i + 2}`).join(", ");
    return query(`SELECT DISTINCT s.* FROM strike s
     JOIN strike_tag st ON st.strike_id = s.id
     WHERE s.user_id = $1 AND s.status = 'active'
       AND st.label IN (${placeholders})
     ORDER BY s.created_at DESC
     LIMIT $${names.length + 2}`, [userId, ...names, limit]);
}
/** B3: Strikes created within +/-7 days of now. */
async function temporalChannel(userId, limit) {
    return query(`SELECT * FROM strike
     WHERE user_id = $1 AND status = 'active'
       AND created_at >= now() - interval '7 days'
       AND created_at <= now() + interval '7 days'
     ORDER BY created_at DESC
     LIMIT $2`, [userId, limit]);
}
/** B4: Semantically similar but opposite polarity. */
async function polarityChannel(nucleus, polarity, activeStrikes, limit) {
    if (!polarity || activeStrikes.length === 0)
        return [];
    const queryEmbedding = await getEmbedding(nucleus);
    const results = [];
    for (const s of activeStrikes) {
        if (s.polarity === polarity)
            continue; // want opposite polarity
        try {
            const emb = await getEmbedding(s.nucleus);
            const sim = cosineSimilarity(queryEmbedding, emb);
            if (sim > 0.7) {
                results.push({ strike: s, sim });
            }
        }
        catch {
            // skip
        }
    }
    results.sort((a, b) => b.sim - a.sim);
    return results.slice(0, limit).map((r) => r.strike);
}
// ---------------------------------------------------------------------------
// Channel C: Cluster retrieval
// ---------------------------------------------------------------------------
async function clusterChannel(nucleus, userId, topClusters, membersPerCluster) {
    // 1. Load cluster Strikes for this user
    const clusters = await query(`SELECT * FROM strike WHERE is_cluster = true AND user_id = $1 AND status = 'active'`, [userId]);
    if (clusters.length === 0)
        return [];
    // 2. Compute similarity of input nucleus to each cluster nucleus
    const queryEmbedding = await getEmbedding(nucleus);
    const clusterScored = [];
    for (const c of clusters) {
        try {
            const emb = await getEmbedding(c.nucleus);
            clusterScored.push({ cluster: c, similarity: cosineSimilarity(queryEmbedding, emb) });
        }
        catch {
            // skip clusters that fail to embed
        }
    }
    clusterScored.sort((a, b) => b.similarity - a.similarity);
    const topHits = clusterScored.slice(0, topClusters);
    // 3. For each top cluster, load members and find best matches
    const results = [];
    for (const { cluster } of topHits) {
        const members = await query(`SELECT s.* FROM bond b
       JOIN strike s ON s.id = b.target_strike_id
       WHERE b.source_strike_id = $1 AND b.type = 'cluster_member'
         AND s.status = 'active'`, [cluster.id]);
        if (members.length === 0)
            continue;
        const memberScored = [];
        for (const m of members) {
            try {
                const emb = await getEmbedding(m.nucleus);
                memberScored.push({ strike: m, similarity: cosineSimilarity(queryEmbedding, emb) });
            }
            catch {
                // skip
            }
        }
        memberScored.sort((a, b) => b.similarity - a.similarity);
        results.push(...memberScored.slice(0, membersPerCluster));
    }
    return results;
}
// ---------------------------------------------------------------------------
// Main: hybrid retrieval
// ---------------------------------------------------------------------------
export async function hybridRetrieve(nucleus, tags, userId, opts) {
    const finalLimit = opts?.limit ?? 10;
    // Load active strikes once (shared by semantic & polarity channels)
    let activeStrikes = [];
    try {
        activeStrikes = await strikeRepo.findActive(userId, 200);
    }
    catch (err) {
        console.warn("[retrieval] Failed to load active strikes:", err);
    }
    // Run channels A+B concurrently; each channel catches its own errors
    const [semanticResults, tagResults, personResults, temporalResults, polarityResults] = await Promise.all([
        semanticChannel(nucleus, activeStrikes, 5).catch((err) => {
            console.warn("[retrieval] semantic channel failed:", err);
            return [];
        }),
        tagChannel(tags, userId, 3).catch((err) => {
            console.warn("[retrieval] tag channel failed:", err);
            return [];
        }),
        personChannel(nucleus, userId, 3).catch((err) => {
            console.warn("[retrieval] person channel failed:", err);
            return [];
        }),
        temporalChannel(userId, 3).catch((err) => {
            console.warn("[retrieval] temporal channel failed:", err);
            return [];
        }),
        polarityChannel(nucleus, opts?.polarity, activeStrikes, 3).catch((err) => {
            console.warn("[retrieval] polarity channel failed:", err);
            return [];
        }),
    ]);
    // Channel C: cluster retrieval (isolated try/catch, failure doesn't affect A+B)
    let clusterResults = [];
    try {
        clusterResults = await clusterChannel(nucleus, userId, 3, 3);
    }
    catch (err) {
        console.warn("[retrieval] cluster channel failed:", err);
    }
    // Build a map: strikeId -> { strike, similarity, channels }
    const map = new Map();
    const ensure = (s) => {
        if (!map.has(s.id)) {
            map.set(s.id, { strike: s, similarity: 0, structuredHits: 0, channels: new Set() });
        }
        return map.get(s.id);
    };
    // Semantic channel
    for (const r of semanticResults) {
        const entry = ensure(r.strike);
        entry.similarity = Math.max(entry.similarity, r.similarity);
        entry.channels.add("semantic");
    }
    // Structured channels
    for (const s of tagResults) {
        const entry = ensure(s);
        entry.structuredHits++;
        entry.channels.add("tag");
    }
    for (const s of personResults) {
        const entry = ensure(s);
        entry.structuredHits++;
        entry.channels.add("person");
    }
    for (const s of temporalResults) {
        const entry = ensure(s);
        entry.structuredHits++;
        entry.channels.add("temporal");
    }
    for (const s of polarityResults) {
        const entry = ensure(s);
        entry.structuredHits++;
        entry.channels.add("polarity");
    }
    // Cluster channel
    for (const r of clusterResults) {
        const entry = ensure(r.strike);
        entry.similarity = Math.max(entry.similarity, r.similarity);
        entry.channels.add("cluster");
    }
    // Compute combined score and sort
    const results = [...map.values()].map((v) => {
        // Normalize structuredHits to 0-1 range (max possible = 4 channels)
        const structuredScore = Math.min(v.structuredHits / 4, 1);
        return {
            strike: v.strike,
            score: v.similarity * 0.6 + structuredScore * 0.4,
            channels: [...v.channels],
        };
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, finalLimit);
}
//# sourceMappingURL=retrieval.js.map