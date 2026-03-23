import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { readBody } from "../lib/http-helpers.js";
import { query } from "../db/pool.js";
import { strikeRepo, strikeTagRepo, bondRepo } from "../db/repositories/index.js";
export function registerCognitiveClusterRoutes(router) {
    // List top-level clusters
    router.get("/api/v1/cognitive/clusters", async (req, res) => {
        const userId = getUserId(req);
        const clusters = await query(`SELECT s.id, s.nucleus,
              COUNT(cm.member_strike_id)::text AS member_count,
              MAX(ms.created_at)::text AS last_record_at
       FROM strike s
       LEFT JOIN cluster_member cm ON cm.cluster_strike_id = s.id
       LEFT JOIN strike ms ON ms.id = cm.member_strike_id
       WHERE s.user_id = $1 AND s.is_cluster = true AND s.status = 'active'
       GROUP BY s.id, s.nucleus
       ORDER BY COUNT(cm.member_strike_id) DESC`, [userId]);
        // Check contradiction & recency for each cluster
        const results = await Promise.all(clusters.map(async (c) => {
            const memberIds = await query(`SELECT member_strike_id FROM cluster_member WHERE cluster_strike_id = $1`, [c.id]);
            const ids = memberIds.map((m) => m.member_strike_id);
            let hasContradiction = false;
            if (ids.length > 0) {
                const [{ count }] = await query(`SELECT COUNT(*) as count FROM bond
             WHERE type = 'contradiction'
               AND source_strike_id = ANY($1) AND target_strike_id = ANY($1)`, [ids]);
                hasContradiction = parseInt(count) > 0;
            }
            const lastDate = c.last_record_at ? new Date(c.last_record_at) : null;
            const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
            const recentlyActive = lastDate ? lastDate > twoWeeksAgo : false;
            return {
                id: c.id,
                name: c.nucleus,
                memberCount: parseInt(c.member_count),
                lastRecordAt: c.last_record_at,
                hasContradiction,
                recentlyActive,
            };
        }));
        sendJson(res, results);
    });
    // Cluster detail
    router.get("/api/v1/cognitive/clusters/:id", async (req, res, params) => {
        const cluster = await strikeRepo.findById(params.id);
        if (!cluster) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: "Cluster not found" }));
            return;
        }
        // Members with tags
        const members = await query(`SELECT s.id, s.nucleus, s.polarity, s.confidence, s.created_at
       FROM strike s
       JOIN cluster_member cm ON cm.member_strike_id = s.id
       WHERE cm.cluster_strike_id = $1 AND s.status = 'active'
       ORDER BY s.created_at DESC`, [params.id]);
        const membersWithTags = await Promise.all(members.map(async (m) => {
            const tags = await strikeTagRepo.findByStrike(m.id);
            return { ...m, tags: tags.map((t) => t.label) };
        }));
        // Contradictions among members
        const memberIds = members.map((m) => m.id);
        const contradictions = memberIds.length > 0
            ? await query(`SELECT sa.id as sa_id, sa.nucleus as sa_nucleus,
                    sb.id as sb_id, sb.nucleus as sb_nucleus
             FROM bond b
             JOIN strike sa ON sa.id = b.source_strike_id
             JOIN strike sb ON sb.id = b.target_strike_id
             WHERE b.type = 'contradiction'
               AND b.source_strike_id = ANY($1) AND b.target_strike_id = ANY($1)`, [memberIds])
            : [];
        // Patterns (realize + inference source_type)
        const patterns = members.filter((m) => m.polarity === "realize");
        // Intents
        const intents = membersWithTags.filter((m) => m.polarity === "intend");
        sendJson(res, {
            id: cluster.id,
            name: cluster.nucleus,
            members: membersWithTags,
            contradictions: contradictions.map((c) => ({
                strikeA: { id: c.sa_id, nucleus: c.sa_nucleus },
                strikeB: { id: c.sb_id, nucleus: c.sb_nucleus },
            })),
            patterns: patterns.map((p) => ({
                id: p.id,
                nucleus: p.nucleus,
                confidence: p.confidence,
            })),
            intents,
        });
    });
    // Create a manual bond between two strikes/clusters
    router.post("/api/v1/cognitive/bonds", async (req, res) => {
        const body = await readBody(req);
        if (!body.sourceStrikeId || !body.targetStrikeId) {
            sendError(res, "sourceStrikeId and targetStrikeId are required");
            return;
        }
        const bond = await bondRepo.create({
            source_strike_id: body.sourceStrikeId,
            target_strike_id: body.targetStrikeId,
            type: body.type ?? "manual",
            strength: 0.7,
            created_by: "user",
        });
        sendJson(res, { ok: true, bondId: bond.id }, 201);
    });
}
//# sourceMappingURL=cognitive-clusters.js.map