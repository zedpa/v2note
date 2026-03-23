import type { Router } from "../router.js";
import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { strikeRepo, bondRepo, summaryRepo } from "../db/repositories/index.js";

/** Bond type → user-facing label */
const BOND_LABEL: Record<string, string> = {
  causal: "因果关联",
  resonance: "主题相似",
  contradiction: "观点变化",
  evolution: "想法演进",
  perspective_of: "不同视角",
};

function bondLabel(type: string): string {
  return BOND_LABEL[type] ?? "相关";
}

export function registerCognitiveRelationRoutes(router: Router) {
  /**
   * GET /api/v1/records/:id/related
   * Returns up to 5 related records based on cognitive bonds.
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
      // 1. Find strikes belonging to this record
      const strikes = await strikeRepo.findBySource(recordId);
      if (strikes.length === 0) {
        sendJson(res, { related: [] });
        return;
      }

      // 2. Collect bonds for each strike
      const seenRecords = new Set<string>();
      seenRecords.add(recordId); // exclude self
      const candidates: Array<{
        record_id: string;
        relation: string;
        bond_strength: number;
        source_id: string;
      }> = [];

      for (const strike of strikes) {
        const bonds = await bondRepo.findByStrike(strike.id);

        for (const bond of bonds) {
          // Skip cluster/abstraction bonds — internal graph mechanics
          if (bond.type === "cluster_member" || bond.type === "abstracted_from" || bond.type === "cluster_link") {
            continue;
          }

          // Find the other side of the bond
          const otherId = bond.source_strike_id === strike.id
            ? bond.target_strike_id
            : bond.source_strike_id;

          const otherStrike = await strikeRepo.findById(otherId);
          if (!otherStrike || !otherStrike.source_id) continue;
          if (seenRecords.has(otherStrike.source_id)) continue;

          seenRecords.add(otherStrike.source_id);
          candidates.push({
            record_id: otherStrike.source_id,
            relation: bondLabel(bond.type),
            bond_strength: bond.strength,
            source_id: otherStrike.source_id,
          });
        }
      }

      // 3. Sort by bond strength descending, take top 5
      candidates.sort((a, b) => b.bond_strength - a.bond_strength);
      const top = candidates.slice(0, 5);

      // 4. Load summaries for related records
      const related = await Promise.all(
        top.map(async (c) => {
          const summary = await summaryRepo.findByRecordId(c.record_id);
          return {
            record_id: c.record_id,
            title: summary?.title ?? "",
            short_summary: summary?.short_summary ?? summary?.long_summary?.slice(0, 80) ?? "",
            relation: c.relation,
            created_at: summary?.created_at ?? "",
          };
        }),
      );

      // Filter out records with no summary
      sendJson(res, { related: related.filter((r) => r.short_summary) });
    } catch (err: any) {
      console.error("[cognitive-relations] Error:", err);
      sendError(res, err.message, 500);
    }
  });
}
