/**
 * Daily cognitive cycle — 3 步：批量分析 + 维护 + 报告
 *
 * v2: 从 8 步简化为 3 步，clustering/emergence/contradiction/promote/tag-sync
 *     全部由 batch-analyze 单次 AI 调用替代。
 */

import { runBatchAnalyze, type BatchAnalyzeResult } from "./batch-analyze.js";
import { normalizeBondTypes, decayBondStrength, decaySalience } from "./maintenance.js";
import { generateCognitiveReport, type CognitiveReport } from "./report.js";
import { appendToDiary } from "../diary/manager.js";

export interface CognitiveCycleResult {
  batchAnalyze: BatchAnalyzeResult | null;
  maintenance: { normalized: number; decayed: number; salience: number } | null;
  report: CognitiveReport | null;
}

export async function runDailyCognitiveCycle(
  userId: string,
  opts?: { deviceId?: string },
): Promise<CognitiveCycleResult> {
  console.log("[cognitive] Starting daily cycle for user", userId);

  let batchResult: BatchAnalyzeResult | null = null;
  let maintenance: CognitiveCycleResult["maintenance"] = null;
  let report: CognitiveReport | null = null;

  // Step 1: 批量分析（替代 clustering + emergence + contradiction + promote + tag-sync）
  try {
    batchResult = await runBatchAnalyze(userId);
    console.log("[cognitive] Batch analyze:", batchResult);
  } catch (err) {
    console.error("[cognitive] Batch analyze failed:", err);
  }

  // Step 2: 维护（Bond 衰减 + salience 衰减）
  try {
    const normalized = await normalizeBondTypes(userId);
    const decayed = await decayBondStrength(userId);
    const salienceDecayed = await decaySalience(userId);
    maintenance = { normalized, decayed, salience: salienceDecayed };
    console.log(
      `[cognitive] Maintenance: normalized=${normalized} decayed=${decayed} salience=${salienceDecayed}`,
    );
  } catch (err) {
    console.error("[cognitive] Maintenance failed:", err);
  }

  // Step 2.5: L2 涌现（每日运行，检查是否有可合并的 L1 聚类）
  try {
    const { runEmergence } = await import("./emergence.js");
    const emergence = await runEmergence(userId);
    console.log(`[cognitive] Emergence: ${emergence.higherOrderClusters} L2 created`);
  } catch (err) {
    console.error("[cognitive] L2 emergence failed:", err);
  }

  // Step 3: 认知报告
  try {
    report = await generateCognitiveReport({ userId, deviceId: opts?.deviceId });
    console.log(`[cognitive] Report: empty=${report.is_empty}`);
  } catch (err) {
    console.error("[cognitive] Report generation failed:", err);
  }

  // 写入 AI 日记（deviceId 仅作设备标记，不可用 userId 替代）
  const deviceId = opts?.deviceId;
  try {
    const digestLines: string[] = [];
    if (batchResult && batchResult.success) {
      if (batchResult.newClusters > 0) {
        digestLines.push(`发现${batchResult.newClusters}个新主题`);
      }
      if (batchResult.contradictions > 0) {
        digestLines.push(`${batchResult.contradictions}处观点变化`);
      }
      if (batchResult.patterns > 0) {
        digestLines.push(`${batchResult.patterns}个思维模式`);
      }
      if (batchResult.goals > 0) {
        digestLines.push(`${batchResult.goals}个涌现目标建议`);
      }
    }

    if (digestLines.length > 0 && deviceId) {
      await appendToDiary(deviceId, "ai-self", `[认知摘要] ${digestLines.join("；")}`, userId);
      console.log("[cognitive] Cognitive digest saved to ai-self diary");
    }
  } catch (err) {
    console.error("[cognitive] Failed to save cognitive digest:", err);
  }

  return { batchAnalyze: batchResult, maintenance, report };
}
