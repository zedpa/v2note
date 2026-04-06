/**
 * Unified Report Handler — 统一日报系统
 * v2 简化版：精简 prompt，移除视角轮换/认知报告等复杂逻辑
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo } from "../db/repositories/index.js";
import { toDateString } from "./daily-loop.js";
import { MORNING_PROMPT, EVENING_PROMPT } from "../prompts/templates.js";

// ── Mode 路由 ──

export type ReportMode = "morning" | "evening";

export function resolveMode(hour: number): "morning" | "evening" {
  return hour >= 6 && hour < 14 ? "morning" : "evening";
}

// ── JSON 解析 ──

function safeParseJson<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ── Morning Report ──

export async function generateMorningReport(
  deviceId: string,
  userId?: string,
): Promise<any> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const [pendingTodos, yesterdayStats] = await Promise.all([
    (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)).catch(() => []),
    (userId
      ? todoRepo.countByUserDateRange(userId, `${yesterday}T00:00:00Z`, `${yesterday}T23:59:59Z`)
      : todoRepo.countByDateRange(deviceId, `${yesterday}T00:00:00Z`, `${yesterday}T23:59:59Z`)
    ).catch(() => ({ done: 0, total: 0 })),
  ]);

  const todayScheduled = pendingTodos.filter((t) =>
    toDateString(t.scheduled_start)?.startsWith(today),
  );
  const overdue = pendingTodos.filter((t) =>
    t.scheduled_end ? new Date(t.scheduled_end) < now : false,
  );

  const pendingText = pendingTodos.length > 0
    ? pendingTodos.slice(0, 10).map((t) => `- ${t.text}`).join("\n")
    : "暂无待办";

  const statsText = `done: ${yesterdayStats.done}, total: ${yesterdayStats.total}`;

  const systemPrompt = MORNING_PROMPT
    .replace("{pendingTodos}", pendingText)
    .replace("{yesterdayStats}", statsText);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `今天: ${today}，请生成晨间简报。` },
  ];

  try {
    const response = await chatCompletion(messages, { json: true, temperature: 0.5, tier: "report" });
    const parsed = safeParseJson<any>(response.content);
    if (!parsed) throw new Error("AI 返回格式异常");

    parsed.mode = "morning";
    parsed.generated_at = new Date().toISOString();
    if (!parsed.stats) {
      parsed.stats = { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total };
    }
    return parsed;
  } catch (err: any) {
    console.error(`[report] Morning generation failed: ${err.message}`);
    return {
      mode: "morning",
      generated_at: new Date().toISOString(),
      headline: `今天有${todayScheduled.length}件事排着`,
      today_focus: todayScheduled.slice(0, 5).map((t) => t.text),
      carry_over: overdue.map((t) => t.text),
      stats: { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total },
    };
  }
}

// ── Evening Report ──

export async function generateEveningReport(
  deviceId: string,
  userId?: string,
): Promise<any> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split("T")[0];

  const [allTodos, pendingTodos] = await Promise.all([
    (userId ? todoRepo.findByUser(userId) : todoRepo.findByDevice(deviceId)).catch(() => []),
    (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)).catch(() => []),
  ]);

  const todayDone = allTodos.filter(
    (t) => t.done && t.completed_at && toDateString(t.completed_at)?.startsWith(today),
  );

  let newRecordCount = 0;
  try {
    const records = userId
      ? await recordRepo.findByUser(userId, { limit: 100 })
      : await recordRepo.findByDevice(deviceId, { limit: 100 });
    newRecordCount = records.filter(
      (r: any) => r.created_at && toDateString(r.created_at)?.startsWith(today),
    ).length;
  } catch { /* non-critical */ }

  const tomorrowScheduled = pendingTodos.filter((t) =>
    toDateString(t.scheduled_start)?.startsWith(tomorrow),
  );

  const doneText = todayDone.length > 0
    ? todayDone.map((t) => `- ${t.text}`).join("\n")
    : "今日无完成事项";

  const pendingText = pendingTodos.slice(0, 5).map((t) => `- ${t.text}`).join("\n") || "无";

  const systemPrompt = EVENING_PROMPT
    .replace("{todayDone}", doneText)
    .replace("{todayPending}", pendingText)
    .replace("{newRecordCount}", String(newRecordCount));

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `今天: ${today}，请生成晚间总结。` },
  ];

  try {
    const response = await chatCompletion(messages, { json: true, temperature: 0.5, tier: "report" });
    const parsed = safeParseJson<any>(response.content);
    if (!parsed) throw new Error("AI 返回格式异常");

    parsed.mode = "evening";
    parsed.generated_at = new Date().toISOString();
    if (!parsed.stats) {
      parsed.stats = { done: todayDone.length, new_records: newRecordCount };
    }
    return parsed;
  } catch (err: any) {
    console.error(`[report] Evening generation failed: ${err.message}`);
    return {
      mode: "evening",
      generated_at: new Date().toISOString(),
      headline: todayDone.length > 0 ? `今天完成了${todayDone.length}件事` : "安静的一天",
      accomplishments: todayDone.slice(0, 5).map((t) => t.text),
      tomorrow_preview: tomorrowScheduled.slice(0, 3).map((t) => t.text),
      stats: { done: todayDone.length, new_records: newRecordCount },
    };
  }
}

// ── 统一入口 ──

export async function generateReport(
  mode: string,
  deviceId: string,
  userId?: string,
): Promise<any> {
  const resolvedMode = mode === "auto" ? resolveMode(new Date().getHours()) : mode;

  switch (resolvedMode) {
    case "morning":
      return generateMorningReport(deviceId, userId);
    case "evening":
      return generateEveningReport(deviceId, userId);
    default:
      throw new Error(`Unsupported report mode: ${resolvedMode}`);
  }
}
