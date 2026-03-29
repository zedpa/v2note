import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { strikeRepo, bondRepo, summaryRepo } from "../db/repositories/index.js";
import { computeRecordRelations } from "../cognitive/record-relations.js";
/** Bond type → user-facing label */
const BOND_LABEL = {
    causal: "因果关联",
    resonance: "主题相似",
    contradiction: "观点变化",
    evolution: "想法演进",
    perspective_of: "不同视角",
};
// 内部图结构 bond 类型，不参与关联聚合
const INTERNAL_BOND_TYPES = new Set([
    "cluster_member",
    "abstracted_from",
    "cluster_link",
]);
export function registerCognitiveRelationRoutes(router) {
    /**
     * GET /api/v1/records/:id/related
     * 日记级关联推荐，使用 bond 聚合公式。
     * 返回关联度 > 0.4 的日记，按关联度降序，最多 10 条。
     */
    router.get("/api/v1/records/:id/related", async (req, res, params) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const recordId = params.id;
        if (!recordId) {
            sendError(res, "Missing record id", 400);
            return;
        }
        try {
            // 1. 当前日记的 strikes
            const strikes = await strikeRepo.findBySource(recordId);
            if (strikes.length === 0) {
                sendJson(res, { related: [], count: 0 });
                return;
            }
            // 2. 收集所有跨记录 bond
            const allBonds = [];
            const otherStrikeIds = new Set();
            for (const strike of strikes) {
                const bonds = await bondRepo.findByStrike(strike.id);
                for (const bond of bonds) {
                    if (INTERNAL_BOND_TYPES.has(bond.type))
                        continue;
                    const otherId = bond.source_strike_id === strike.id
                        ? bond.target_strike_id
                        : bond.source_strike_id;
                    allBonds.push(bond);
                    otherStrikeIds.add(otherId);
                }
            }
            if (allBonds.length === 0) {
                sendJson(res, { related: [], count: 0 });
                return;
            }
            // 3. 加载对端 strike 信息，构建映射
            const strikeToRecord = {};
            const strikeSourceTypes = {};
            const recordStrikeCounts = {};
            for (const id of otherStrikeIds) {
                const s = await strikeRepo.findById(id);
                if (!s || !s.source_id || s.source_id === recordId)
                    continue;
                strikeToRecord[id] = s.source_id;
                if (s.source_type)
                    strikeSourceTypes[id] = s.source_type;
                recordStrikeCounts[s.source_id] = (recordStrikeCounts[s.source_id] ?? 0) + 1;
            }
            // 4. 聚合
            const relations = await computeRecordRelations(recordId, strikes, allBonds, recordStrikeCounts, strikeSourceTypes, strikeToRecord);
            // 5. 加载摘要
            const related = await Promise.all(relations.map(async (r) => {
                const summary = await summaryRepo.findByRecordId(r.record_id);
                return {
                    record_id: r.record_id,
                    title: summary?.title ?? "",
                    short_summary: summary?.short_summary ?? summary?.long_summary?.slice(0, 80) ?? "",
                    relevance: Math.round(r.relevance * 100) / 100,
                    created_at: summary?.created_at ?? "",
                };
            }));
            sendJson(res, {
                related: related.filter((r) => r.short_summary),
                count: relations.length,
            });
        }
        catch (err) {
            console.error("[cognitive-relations] Error:", err);
            sendError(res, err.message, 500);
        }
    });
}
//# sourceMappingURL=cognitive-relations.js.map