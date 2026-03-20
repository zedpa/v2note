import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { query, queryOne } from "../db/pool.js";
export function registerCognitiveStatsRoutes(router) {
    router.get("/api/v1/cognitive/stats", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        // Run all queries in parallel
        const [polarityRows, lagRow, clusterRows, contradictionRow, totalStrikesRow, totalBondsRow, totalClustersRow,] = await Promise.all([
            // 1. Polarity distribution
            query(`SELECT polarity, COUNT(*) as count FROM strike
         WHERE user_id = $1 AND status = 'active'
         GROUP BY polarity`, [userId]),
            // 2. Realize lag
            queryOne(`SELECT AVG(EXTRACT(EPOCH FROM (r.created_at - p.created_at)) / 86400) as avg_days
         FROM bond b
         JOIN strike p ON p.id = b.source_strike_id AND p.polarity = 'perceive'
         JOIN strike r ON r.id = b.target_strike_id AND r.polarity = 'realize'
         WHERE p.user_id = $1`, [userId]),
            // 3. Top-5 clusters
            query(`SELECT s.id, s.nucleus as name, COUNT(cm.target_strike_id) as member_count
         FROM strike s
         JOIN bond cm ON cm.source_strike_id = s.id AND cm.type = 'cluster_member'
         WHERE s.user_id = $1 AND s.is_cluster = true
         GROUP BY s.id, s.nucleus
         ORDER BY member_count DESC LIMIT 5`, [userId]),
            // 4. Contradiction count
            queryOne(`SELECT COUNT(*) as count FROM bond b
         JOIN strike s ON s.id = b.source_strike_id
         WHERE s.user_id = $1 AND b.type = 'contradiction'`, [userId]),
            // 5. Total active strikes
            queryOne(`SELECT COUNT(*) as count FROM strike
         WHERE user_id = $1 AND status = 'active'`, [userId]),
            // 6. Total bonds
            queryOne(`SELECT COUNT(*) as count FROM bond b
         JOIN strike s ON s.id = b.source_strike_id
         WHERE s.user_id = $1`, [userId]),
            // 7. Total clusters
            queryOne(`SELECT COUNT(*) as count FROM strike
         WHERE user_id = $1 AND is_cluster = true`, [userId]),
        ]);
        // Build polarity distribution map
        const polarityDistribution = {};
        for (const row of polarityRows) {
            polarityDistribution[row.polarity] = parseInt(row.count, 10);
        }
        const stats = {
            polarityDistribution,
            realizeLag: lagRow?.avg_days ? parseFloat(lagRow.avg_days) : null,
            topClusters: clusterRows.map((c) => ({
                id: c.id,
                name: c.name,
                memberCount: parseInt(c.member_count, 10),
            })),
            contradictionCount: parseInt(contradictionRow?.count ?? "0", 10),
            totalStrikes: parseInt(totalStrikesRow?.count ?? "0", 10),
            totalBonds: parseInt(totalBondsRow?.count ?? "0", 10),
            totalClusters: parseInt(totalClustersRow?.count ?? "0", 10),
        };
        sendJson(res, stats);
    });
}
//# sourceMappingURL=cognitive-stats.js.map