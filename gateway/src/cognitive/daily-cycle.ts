/**
 * Daily cognitive cycle — Wiki 编译 + 认知报告
 *
 * v3: Strike/Bond/Cluster 引擎已移除。
 *     每日流程：周期任务 → Wiki 编译 → 认知报告 → AI 日记
 */

import { compileWikiForUser, type CompileResult } from "./wiki-compiler.js";
import { generateCognitiveReport, type CognitiveReport } from "./report.js";
import { appendToDiary } from "../diary/manager.js";
import * as todoRepo from "../db/repositories/todo.js";
import { today as tzToday, now as tzNow } from "../lib/tz.js";

export interface CognitiveCycleResult {
  wikiCompile: CompileResult | null;
  report: CognitiveReport | null;
  recurringInstances: number;
}

export async function runDailyCognitiveCycle(
  userId: string,
  opts?: { deviceId?: string },
): Promise<CognitiveCycleResult> {
  console.log("[cognitive] Starting daily cycle for user", userId);

  let wikiCompile: CompileResult | null = null;
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

  // Step 1: Wiki 编译（替代原 batch-analyze + emergence + maintenance）
  try {
    wikiCompile = await compileWikiForUser(userId);
    console.log("[cognitive] Wiki compile:", wikiCompile);
  } catch (err) {
    console.error("[cognitive] Wiki compile failed:", err);
  }

  // Step 2: 认知报告
  try {
    report = await generateCognitiveReport({ userId, deviceId: opts?.deviceId });
    console.log(`[cognitive] Report: empty=${report.is_empty}`);
  } catch (err) {
    console.error("[cognitive] Report generation failed:", err);
  }

  // 写入 AI 日记摘要
  const deviceId = opts?.deviceId;
  try {
    const digestLines: string[] = [];
    if (wikiCompile) {
      if (wikiCompile.pages_created > 0) {
        digestLines.push(`新建${wikiCompile.pages_created}个知识页`);
      }
      if (wikiCompile.pages_updated > 0) {
        digestLines.push(`更新${wikiCompile.pages_updated}个知识页`);
      }
      if (wikiCompile.records_compiled > 0) {
        digestLines.push(`编译${wikiCompile.records_compiled}条记录`);
      }
    }

    if (digestLines.length > 0 && deviceId) {
      await appendToDiary(deviceId, "ai-self", `[认知摘要] ${digestLines.join("；")}`, userId);
      console.log("[cognitive] Cognitive digest saved to ai-self diary");
    }
  } catch (err) {
    console.error("[cognitive] Failed to save cognitive digest:", err);
  }

  return { wikiCompile, report, recurringInstances };
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

  const today = tzNow();
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
