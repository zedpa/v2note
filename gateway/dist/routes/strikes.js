import { readBody, sendJson, sendError } from "../lib/http-helpers.js";
import { strikeRepo, strikeTagRepo, bondRepo, transcriptRepo, } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
export function registerStrikeRoutes(router) {
    // GET /api/v1/records/:id/strikes — 获取某条记录的 Strike 列表
    router.get("/api/v1/records/:id/strikes", async (_req, _res, params) => {
        const strikes = await strikeRepo.findBySource(params.id);
        // Batch load tags for each strike
        const results = await Promise.all(strikes.map(async (s) => {
            const tags = await strikeTagRepo.findByStrike(s.id);
            return {
                id: s.id,
                nucleus: s.nucleus,
                polarity: s.polarity,
                confidence: s.confidence,
                tags: tags.map((t) => t.label),
                created_at: s.created_at,
            };
        }));
        sendJson(_res, results);
    });
    // GET /api/v1/strikes/:id/trace — 溯源链
    router.get("/api/v1/strikes/:id/trace", async (_req, res, params) => {
        const strike = await strikeRepo.findById(params.id);
        if (!strike) {
            sendError(res, "Strike not found", 404);
            return;
        }
        // Source record + transcript
        let source = null;
        if (strike.source_id) {
            const transcript = await transcriptRepo.findByRecordId(strike.source_id);
            source = {
                recordId: strike.source_id,
                text: transcript?.text ?? "",
            };
        }
        // All related bonds with the other strike's info
        const allBonds = await bondRepo.findByStrike(strike.id);
        const bonds = await Promise.all(allBonds.map(async (b) => {
            const otherId = b.source_strike_id === strike.id
                ? b.target_strike_id
                : b.source_strike_id;
            const other = await strikeRepo.findById(otherId);
            return {
                id: b.id,
                type: b.type,
                strength: b.strength,
                otherStrike: other
                    ? { id: other.id, nucleus: other.nucleus, polarity: other.polarity }
                    : null,
            };
        }));
        // Clusters this strike belongs to (via cluster_member bonds)
        const clusterRows = await query(`SELECT s.id, s.nucleus as name FROM bond b
       JOIN strike s ON s.id = b.source_strike_id
       WHERE b.target_strike_id = $1 AND b.type = 'cluster_member'`, [strike.id]);
        const clusters = clusterRows.map((c) => ({ id: c.id, name: c.name }));
        // Superseded-by chain
        let supersededBy = null;
        if (strike.status === "superseded" && strike.superseded_by) {
            const sup = await strikeRepo.findById(strike.superseded_by);
            if (sup) {
                supersededBy = { id: sup.id, nucleus: sup.nucleus };
            }
        }
        sendJson(res, {
            strike: {
                id: strike.id,
                nucleus: strike.nucleus,
                polarity: strike.polarity,
                confidence: strike.confidence,
                created_at: strike.created_at,
            },
            source,
            bonds,
            clusters,
            supersededBy,
        });
    });
    // PATCH /api/v1/strikes/:id — 修改 Strike（nucleus / polarity）
    router.patch("/api/v1/strikes/:id", async (req, res, params) => {
        const body = await readBody(req);
        const fields = {};
        if (body.nucleus !== undefined)
            fields.nucleus = body.nucleus;
        if (body.polarity !== undefined)
            fields.polarity = body.polarity;
        if (Object.keys(fields).length === 0) {
            sendJson(res, { ok: true });
            return;
        }
        await strikeRepo.update(params.id, fields);
        // 修改后将该 strike 相关 tag 的 created_by 标记为 'user'
        const tags = await strikeTagRepo.findByStrike(params.id);
        for (const tag of tags) {
            await strikeTagRepo.updateCreatedBy(tag.id, "user");
        }
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=strikes.js.map