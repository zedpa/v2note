/**
 * Daily cognitive cycle — orchestrates clustering, contradiction scan,
 * promote, and maintenance in sequence.
 */

import { runClustering, type ClusteringResult } from "./clustering.js";
import { scanContradictions, type ContradictionResult } from "./contradiction.js";
import { runPromote, type PromoteResult } from "./promote.js";
import { normalizeBondTypes, decayBondStrength, decaySalience } from "./maintenance.js";
import { generateAlerts, type CognitiveAlert } from "./alerts.js";
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
