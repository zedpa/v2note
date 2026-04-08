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
import * as todoRepo from "../db/repositories/todo.js";
import { today as tzToday } from "../lib/tz.js";

export interface CognitiveCycleResult {
  batchAnalyze: BatchAnalyzeResult | null;
  maintenance: { normalized: number; decayed: number; salience: number } | null;
  report: CognitiveReport | null;
  recurringInstances: number;
}

export async function runDailyCognitiveCycle(
  userId: string,
  opts?: { deviceId?: string },
): Promise<CognitiveCycleResult> {
  console.log("[cognitive] Starting daily cycle for user", userId);

  let batchResult: BatchAnalyzeResult | null = null;
  let maintenance: CognitiveCycleResult["maintenance"] = null;
  let report: CognitiveReport | null = null;

  // Step 0: 生成今日的周期任务实例
  let recurringInstances = 0;
  try {
    recurringInstances = await generateRecurringInstances(userId, opts?.deviceId);
    if (recurringInstances > 0) {
      console.log(`[cognitive] Generated ${recurringInstances} recurring task instances`);
    }
  } catch (err) {
    console.error("[cognitive] Recurring instance generation failed:", err);
  }

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

  return { batchAnalyze: batchResult, maintenance, report, recurringInstances };
}

// ── 周期任务实例生成 ──────────────────────────────────────────────

/** 解析 recurrence_rule，判断指定日期是否命中 */
function matchesRecurrenceRule(rule: string, date: Date): boolean {
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...6=Sat
  const dayOfMonth = date.getDate();

  if (rule === "daily") return true;
  if (rule === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5;

  if (rule.startsWith("weekly:")) {
    const days = rule.slice(7).split(",").map(Number);
    return days.includes(dayOfWeek);
  }

  if (rule.startsWith("monthly:")) {
    const targetDay = parseInt(rule.slice(8), 10);
    return dayOfMonth === targetDay;
  }

  return false;
}

/** 为指定用户生成今日的周期任务实例 */
async function generateRecurringInstances(
  userId: string,
  deviceId?: string,
): Promise<number> {
  const templates = await todoRepo.findRecurrenceTemplates({
    userId,
    deviceId,
  });

  if (templates.length === 0) return 0;

  const today = new Date();
  const todayStr = tzToday();
  let created = 0;

  for (const template of templates) {
    if (!template.recurrence_rule) continue;

    // 检查是否命中今天
    if (!matchesRecurrenceRule(template.recurrence_rule, today)) continue;

    // 检查今天是否已有实例
    const exists = await todoRepo.hasInstanceForDate(template.id, todayStr);
    if (exists) continue;

    // 创建实例
    await todoRepo.createRecurrenceInstance(template, todayStr);
    created++;
  }

  return created;
}
