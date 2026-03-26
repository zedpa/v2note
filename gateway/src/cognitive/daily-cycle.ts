/**
 * Daily cognitive cycle — orchestrates clustering, contradiction scan,
 * promote, and maintenance in sequence.
 */

import { runClustering, type ClusteringResult } from "./clustering.js";
import { scanContradictions, type ContradictionResult } from "./contradiction.js";
import { runPromote, type PromoteResult } from "./promote.js";
import { normalizeBondTypes, decayBondStrength, decaySalience } from "./maintenance.js";
import { generateAlerts, type CognitiveAlert } from "./alerts.js";
import { syncClusterTags } from "./tag-sync.js";
import { generateCognitiveReport, type CognitiveReport } from "./report.js";
import { runEmergence } from "./emergence.js";
import { discoverL2Clusters } from "./l2-emergence.js";
import { query } from "../db/pool.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";
import { appendToDiary } from "../diary/manager.js";

export interface CognitiveCycleResult {
  clustering: ClusteringResult | null;
  contradictions: ContradictionResult[];
  promote: PromoteResult | null;
  alerts: CognitiveAlert[];
}

export async function runDailyCognitiveCycle(
  userId: string,
  opts?: { deviceId?: string },
): Promise<CognitiveCycleResult> {
  console.log("[cognitive] Starting daily cycle for user", userId);

  let clusterResult: ClusteringResult | null = null;
  let contradictions: ContradictionResult[] = [];
  let promoteResult: PromoteResult | null = null;
  let alerts: CognitiveAlert[] = [];

  // 2a. Clustering
  try {
    clusterResult = await runClustering(userId);
    console.log("[cognitive] Clustering:", clusterResult);
  } catch (err) {
    console.error("[cognitive] Clustering failed:", err);
  }

  // 2a-2. Emergence (cross-cluster bonds, resonance, patterns)
  try {
    const emergenceResult = await runEmergence(userId);
    console.log("[cognitive] Emergence:", emergenceResult);
  } catch (err) {
    console.error("[cognitive] Emergence failed:", err);
  }

  // 2a-3. L2 emergence (when 3+ new L1 clusters created)
  if (clusterResult && clusterResult.newClusters >= 3) {
    try {
      const l1Clusters = await query<StrikeEntry>(
        `SELECT * FROM strike WHERE user_id = $1 AND is_cluster = true AND level = 1 AND status = 'active'`,
        [userId],
      );
      const l1Bonds = await query<BondEntry>(
        `SELECT b.* FROM bond b
         JOIN strike s1 ON s1.id = b.source_strike_id AND s1.is_cluster = true AND s1.level = 1
         JOIN strike s2 ON s2.id = b.target_strike_id AND s2.is_cluster = true AND s2.level = 1
         WHERE s1.user_id = $1 AND b.type != 'cluster_member'`,
        [userId],
      );
      const clusterBonds = l1Bonds.map((b) => ({
        source: b.source_strike_id,
        target: b.target_strike_id,
        strength: b.strength,
      }));
      const l2Result = await discoverL2Clusters(userId, l1Clusters, clusterBonds);
      console.log(`[cognitive] L2 emergence: ${l2Result.created} created`);
    } catch (err) {
      console.error("[cognitive] L2 emergence failed:", err);
    }
  }

  // 2b. Contradiction scan
  try {
    contradictions = await scanContradictions(userId);
    console.log("[cognitive] Contradictions found:", contradictions.length);
  } catch (err) {
    console.error("[cognitive] Contradiction scan failed:", err);
  }

  // 2c. Promote (semantic fusion)
  try {
    promoteResult = await runPromote(userId);
    console.log("[cognitive] Promote:", promoteResult);
  } catch (err) {
    console.error("[cognitive] Promote failed:", err);
  }

  // 2e. Cognitive alerts (contradiction push)
  try {
    alerts = await generateAlerts(userId);
    if (alerts.length > 0) {
      console.log("[cognitive] Alerts generated:", alerts.length);
      for (const alert of alerts) {
        console.log("[cognitive] Alert:", alert.description);
      }
    }
  } catch (err) {
    console.error("[cognitive] Alert generation failed:", err);
  }

  // 2d. Maintenance
  try {
    const normalized = await normalizeBondTypes(userId);
    const decayed = await decayBondStrength(userId);
    const salienceDecayed = await decaySalience(userId);
    console.log(
      "[cognitive] Maintenance: normalized=" +
        normalized +
        " decayed=" +
        decayed +
        " salience=" +
        salienceDecayed,
    );
  } catch (err) {
    console.error("[cognitive] Maintenance failed:", err);
  }

  // 2e. Tag sync — Cluster 标签反写到成员 Strike
  try {
    const tagSync = await syncClusterTags(userId);
    console.log(`[cognitive] Tag sync: created=${tagSync.created} retired=${tagSync.retired}`);
  } catch (err) {
    console.error("[cognitive] Tag sync failed:", err);
  }

  // 2f. Cognitive report — 结构化认知报告
  let cognitiveReport: CognitiveReport | null = null;
  try {
    cognitiveReport = await generateCognitiveReport(userId);
    console.log(`[cognitive] Report: empty=${cognitiveReport.is_empty} strikes=${JSON.stringify(cognitiveReport.today_strikes)}`);
  } catch (err) {
    console.error("[cognitive] Report generation failed:", err);
  }

  // Store cognitive digest into AI diary (ai-self notebook)
  const deviceId = opts?.deviceId ?? userId;
  try {
    const digestLines: string[] = [];
    if (clusterResult && (clusterResult.newClusters > 0 || clusterResult.updatedClusters > 0)) {
      digestLines.push(`发现${clusterResult.newClusters}个新主题关联，更新${clusterResult.updatedClusters}个已有关联`);
    }
    if (contradictions.length > 0) {
      const summaries = contradictions.slice(0, 3).map(
        (c) => `「${c.strikeA.nucleus.slice(0, 20)}」↔「${c.strikeB.nucleus.slice(0, 20)}」`,
      );
      digestLines.push(`观点变化: ${summaries.join("; ")}`);
    }
    if (promoteResult && promoteResult.promoted > 0) {
      digestLines.push(`${promoteResult.promoted}条想法融合提炼`);
    }
    if (alerts.length > 0) {
      digestLines.push(`${alerts.length}条认知提醒待回顾`);
    }

    if (digestLines.length > 0) {
      await appendToDiary(deviceId, "ai-self", `[认知摘要] ${digestLines.join("；")}`, userId);
      console.log("[cognitive] Cognitive digest saved to ai-self diary");
    }
  } catch (err) {
    console.error("[cognitive] Failed to save cognitive digest:", err);
  }

  return { clustering: clusterResult, contradictions, promote: promoteResult, alerts };
}
