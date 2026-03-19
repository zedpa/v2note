/**
 * Daily cognitive cycle — orchestrates clustering, contradiction scan,
 * promote, and maintenance in sequence.
 */

import { runClustering } from "./clustering.js";
import { scanContradictions } from "./contradiction.js";
import { runPromote } from "./promote.js";
import { normalizeBondTypes, decayBondStrength, decaySalience } from "./maintenance.js";

export async function runDailyCognitiveCycle(userId: string): Promise<void> {
  console.log("[cognitive] Starting daily cycle for user", userId);

  // 2a. Clustering
  try {
    const clusterResult = await runClustering(userId);
    console.log("[cognitive] Clustering:", clusterResult);
  } catch (err) {
    console.error("[cognitive] Clustering failed:", err);
  }

  // 2b. Contradiction scan
  try {
    const contradictions = await scanContradictions(userId);
    console.log("[cognitive] Contradictions found:", contradictions.length);
  } catch (err) {
    console.error("[cognitive] Contradiction scan failed:", err);
  }

  // 2c. Promote (semantic fusion)
  try {
    const promoteResult = await runPromote(userId);
    console.log("[cognitive] Promote:", promoteResult);
  } catch (err) {
    console.error("[cognitive] Promote failed:", err);
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
}
