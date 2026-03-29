import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { query, queryOne } from "../db/pool.js";
import { digestRecords } from "../handlers/digest.js";
import { runBatchAnalyze } from "../cognitive/batch-analyze.js";
import { runDailyCognitiveCycle } from "../cognitive/daily-cycle.js";
// material 过滤条件（排除 material，保留 think/voice/null 等）
const THINK_ONLY = `AND COALESCE(source_type, 'think') != 'material'`;
export function registerCognitiveStatsRoutes(router) {
    router.get("/api/v1/cognitive/stats", async (req, res, _params, queryParams) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const includeMaterial = queryParams?.include_material === "true";
        // Run all queries in parallel — main stats only count think
        const [polarityRows, lagRow, clusterRows, contradictionRow, totalStrikesRow, totalBondsRow, totalClustersRow,] = await Promise.all([
            // 1. Polarity distribution (think only)
            query(`SELECT polarity, COUNT(*) as count FROM strike
         WHERE user_id = $1 AND status = 'active' ${THINK_ONLY}
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
            // 5. Total active strikes (think only)
            queryOne(`SELECT COUNT(*) as count FROM strike
         WHERE user_id = $1 AND status = 'active' ${THINK_ONLY}`, [userId]),
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
        // 可选：返回 material 独立统计
        if (includeMaterial) {
            const [matPolarityRows, matTotalRow] = await Promise.all([
                query(`SELECT polarity, COUNT(*) as count FROM strike
           WHERE user_id = $1 AND status = 'active' AND source_type = 'material'
           GROUP BY polarity`, [userId]),
                queryOne(`SELECT COUNT(*) as count FROM strike
           WHERE user_id = $1 AND status = 'active' AND source_type = 'material'`, [userId]),
            ]);
            const matPolarityDist = {};
            for (const row of matPolarityRows) {
                matPolarityDist[row.polarity] = parseInt(row.count, 10);
            }
            stats.materialStats = {
                polarityDistribution: matPolarityDist,
                totalStrikes: parseInt(matTotalRow?.count ?? "0", 10),
            };
        }
        sendJson(res, stats);
    });
    // ── POST /api/v1/cognitive/redigest — 补跑未消化的记录（异步） ──
    router.post("/api/v1/cognitive/redigest", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        // 查总共还有多少未消化
        const totalRow = await queryOne(`SELECT COUNT(*) as count FROM record
       WHERE user_id = $1 AND (digested = false OR digested IS NULL) AND status = 'completed'`, [userId]);
        const totalRemaining = parseInt(totalRow?.count ?? "0", 10);
        if (totalRemaining === 0) {
            sendJson(res, { message: "所有记录已消化", remaining: 0 });
            return;
        }
        // 立即返回，后台异步处理
        sendJson(res, { message: `开始后台处理 ${totalRemaining} 条记录`, remaining: totalRemaining });
        // 异步：每次取 5 条串行处理，处理完再取下一批
        const batchSize = 5;
        (async () => {
            let processed = 0;
            let failed = 0;
            while (true) {
                const batch = await query(`SELECT id, device_id FROM record
           WHERE user_id = $1 AND (digested = false OR digested IS NULL) AND status = 'completed'
           ORDER BY created_at ASC LIMIT $2`, [userId, batchSize]);
                if (batch.length === 0)
                    break;
                for (const record of batch) {
                    try {
                        await digestRecords([record.id], { deviceId: record.device_id, userId });
                        processed++;
                    }
                    catch (e) {
                        console.error(`[redigest] Failed for ${record.id}:`, e.message);
                        failed++;
                    }
                }
                console.log(`[redigest] Progress: ${processed} processed, ${failed} failed`);
            }
            console.log(`[redigest] Done: ${processed} processed, ${failed} failed`);
        })().catch(e => console.error("[redigest] Background task failed:", e));
    });
    // ── POST /api/v1/cognitive/batch-analyze — 手动触发 Tier2 批量分析 ──
    router.post("/api/v1/cognitive/batch-analyze", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        sendJson(res, { message: "批量分析已启动" });
        runBatchAnalyze(userId).then(result => {
            console.log(`[cognitive/batch-analyze] Done:`, result);
        }).catch(e => {
            console.error("[cognitive/batch-analyze] Failed:", e);
        });
    });
    // ── POST /api/v1/cognitive/cycle — 手动触发完整认知循环（批量分析+维护+报告） ──
    router.post("/api/v1/cognitive/cycle", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        sendJson(res, { message: "认知循环已启动" });
        runDailyCognitiveCycle(userId).then(result => {
            console.log(`[cognitive/cycle] Done:`, result);
        }).catch(e => {
            console.error("[cognitive/cycle] Failed:", e);
        });
    });
}
//# sourceMappingURL=cognitive-stats.js.map