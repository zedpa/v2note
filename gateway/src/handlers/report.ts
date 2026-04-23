/**
 * Unified Report Handler — 统一日报系统
 * v2 简化版：精简 prompt，移除视角轮换/认知报告等复杂逻辑
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo } from "../db/repositories/index.js";
import { toLocalDateStr, generateEveningSummary } from "./daily-loop.js";
import { MORNING_PROMPT } from "../prompts/templates.js";
import { fmt } from "../lib/date-anchor.js";
import { dayRange, now as tzNow, toLocalDateTime } from "../lib/tz.js";
import { addDays as dfAddDays } from "date-fns";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";

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
  deviceId: string, // 已弃用，保留兼容
  userId?: string,
): Promise<any> {
  const uid = userId ?? deviceId;
  const now = tzNow();
  const today = fmt(now);
  const yesterday = fmt(dfAddDays(now, -1));

  const [pendingTodos, yesterdayStats, soul, profile] = await Promise.all([
    todoRepo.findPendingByUser(uid).catch(() => []),
    (() => {
      const yd = dayRange(yesterday);
      return todoRepo.countByUserDateRange(uid, yd.start, yd.end)
        .catch(() => ({ done: 0, total: 0 }));
    })(),
    loadSoul(uid, uid).catch(() => null),
    loadProfile(uid, uid).catch(() => null),
  ]);

  const todayScheduled = pendingTodos.filter((t) =>
    toLocalDateStr(t.scheduled_start) === today,
  );
  const overdue = pendingTodos.filter((t) =>
    t.scheduled_end ? new Date(t.scheduled_end) < now : false,
  );

  const pendingText = pendingTodos.length > 0
    ? pendingTodos.slice(0, 10).map((t) => `- ${t.text}`).join("\n")
    : "暂无待办";

  const statsText = `done: ${yesterdayStats.done}, total: ${yesterdayStats.total}`;
  const soulText = soul?.content ? soul.content.slice(0, 200) : "";
  const profileText = profile?.content ? profile.content.slice(0, 200) : "";

  const systemPrompt = MORNING_PROMPT
    .replace("{pendingTodos}", pendingText)
    .replace("{yesterdayStats}", statsText)
    .replace("{soul}", soulText)
    .replace("{profile}", profileText);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `今天: ${today}，请生成晨间简报。` },
  ];

  try {
    const response = await chatCompletion(messages, { json: true, temperature: 0.5, tier: "report" });
    const parsed = safeParseJson<any>(response.content);
    if (!parsed) throw new Error("AI 返回格式异常");

    parsed.mode = "morning";
    parsed.generated_at = toLocalDateTime(tzNow());
    if (!parsed.stats) {
      parsed.stats = { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total };
    }
    return parsed;
  } catch (err: any) {
    console.error(`[report] Morning generation failed: ${err.message}`);
    return {
      mode: "morning",
      generated_at: toLocalDateTime(tzNow()),
      headline: `今天有${todayScheduled.length}件事排着`,
      today_focus: todayScheduled.slice(0, 5).map((t) => t.text),
      carry_over: overdue.map((t) => t.text),
      stats: { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total },
    };
  }
}

// ── 统一入口 ──

export async function generateReport(
  mode: string,
  deviceId: string,
  userId?: string,
): Promise<any> {
  const resolvedMode = mode === "auto" ? resolveMode(tzNow().getHours()) : mode;

  switch (resolvedMode) {
    case "morning":
      return generateMorningReport(deviceId, userId);
    case "evening":
      // 统一到 v2 路径，避免 legacy 路径数据错误（全量 pending 被标为 todayPending）
      return generateEveningSummary(deviceId, userId);
    default:
      throw new Error(`Unsupported report mode: ${resolvedMode}`);
  }
}
