import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { query, queryOne } from "../db/pool.js";
import { digestRecords } from "../handlers/digest.js";
import { compileWikiForUser } from "../cognitive/wiki-compiler.js";
import { runDailyCognitiveCycle } from "../cognitive/daily-cycle.js";
export function registerCognitiveStatsRoutes(router) {
    // ── GET /api/v1/cognitive/stats — Wiki 时代的认知统计 ──
    router.get("/api/v1/cognitive/stats", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const [totalRecordsRow, compiledRecordsRow, totalPagesRow, activePagesRow,] = await Promise.all([
            queryOne(`SELECT COUNT(*) as count FROM record WHERE user_id = $1`, [userId]),
            queryOne(`SELECT COUNT(*) as count FROM record WHERE user_id = $1 AND compile_status = 'compiled'`, [userId]),
            queryOne(`SELECT COUNT(*) as count FROM wiki_page WHERE user_id = $1`, [userId]),
            queryOne(`SELECT COUNT(*) as count FROM wiki_page WHERE user_id = $1 AND status = 'active'`, [userId]),
        ]);
        sendJson(res, {
            totalRecords: parseInt(totalRecordsRow?.count ?? "0", 10),
            compiledRecords: parseInt(compiledRecordsRow?.count ?? "0", 10),
            totalPages: parseInt(totalPagesRow?.count ?? "0", 10),
            activePages: parseInt(activePagesRow?.count ?? "0", 10),
        });
    });
    // ── POST /api/v1/cognitive/redigest — 补跑未消化的记录（异步） ──
    router.post("/api/v1/cognitive/redigest", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const totalRow = await queryOne(`SELECT COUNT(*) as count FROM record
       WHERE user_id = $1 AND (digested = false OR digested IS NULL) AND status = 'completed'`, [userId]);
        const totalRemaining = parseInt(totalRow?.count ?? "0", 10);
        if (totalRemaining === 0) {
            sendJson(res, { message: "所有记录已消化", remaining: 0 });
            return;
        }
        sendJson(res, { message: `开始后台处理 ${totalRemaining} 条记录`, remaining: totalRemaining });
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
    // ── POST /api/v1/cognitive/compile — 手动触发 Wiki 编译（替代旧 batch-analyze） ──
    router.post("/api/v1/cognitive/compile", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        sendJson(res, { message: "Wiki 编译已启动" });
        compileWikiForUser(userId).then(result => {
            console.log(`[cognitive/compile] Done:`, result);
        }).catch(e => {
            console.error("[cognitive/compile] Failed:", e);
        });
    });
    // ── POST /api/v1/cognitive/cycle — 手动触发完整认知循环（Wiki编译+报告） ──
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