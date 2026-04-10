/**
 * Unified Report Handler — 统一日报系统
 * v2 简化版：精简 prompt，移除视角轮换/认知报告等复杂逻辑
 */
import { chatCompletion } from "../ai/provider.js";
import { todoRepo, recordRepo } from "../db/repositories/index.js";
import { toDateString } from "./daily-loop.js";
import { MORNING_PROMPT, EVENING_PROMPT } from "../prompts/templates.js";
import { fmt } from "../lib/date-anchor.js";
import { dayRange, now as tzNow, toLocalDateTime } from "../lib/tz.js";
import { addDays as dfAddDays } from "date-fns";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
export function resolveMode(hour) {
    return hour >= 6 && hour < 14 ? "morning" : "evening";
}
// ── JSON 解析 ──
function safeParseJson(text) {
    try {
        const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        return JSON.parse(cleaned);
    }
    catch {
        return null;
    }
}
// ── Morning Report ──
export async function generateMorningReport(deviceId, userId) {
    const now = tzNow();
    const today = fmt(now);
    const yesterday = fmt(dfAddDays(now, -1));
    const [pendingTodos, yesterdayStats, soul, profile] = await Promise.all([
        (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)).catch(() => []),
        (() => {
            const yd = dayRange(yesterday);
            return (userId
                ? todoRepo.countByUserDateRange(userId, yd.start, yd.end)
                : todoRepo.countByDateRange(deviceId, yd.start, yd.end)).catch(() => ({ done: 0, total: 0 }));
        })(),
        loadSoul(deviceId, userId).catch(() => null),
        loadProfile(deviceId, userId).catch(() => null),
    ]);
    const todayScheduled = pendingTodos.filter((t) => toDateString(t.scheduled_start)?.startsWith(today));
    const overdue = pendingTodos.filter((t) => t.scheduled_end ? new Date(t.scheduled_end) < now : false);
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
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `今天: ${today}，请生成晨间简报。` },
    ];
    try {
        const response = await chatCompletion(messages, { json: true, temperature: 0.5, tier: "report" });
        const parsed = safeParseJson(response.content);
        if (!parsed)
            throw new Error("AI 返回格式异常");
        parsed.mode = "morning";
        parsed.generated_at = toLocalDateTime(tzNow());
        if (!parsed.stats) {
            parsed.stats = { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total };
        }
        return parsed;
    }
    catch (err) {
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
// ── Evening Report ──
export async function generateEveningReport(deviceId, userId) {
    const now = tzNow();
    const today = fmt(now);
    const tomorrow = fmt(dfAddDays(now, 1));
    const [allTodos, pendingTodos, soul, profile] = await Promise.all([
        (userId ? todoRepo.findByUser(userId) : todoRepo.findByDevice(deviceId)).catch(() => []),
        (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)).catch(() => []),
        loadSoul(deviceId, userId).catch(() => null),
        loadProfile(deviceId, userId).catch(() => null),
    ]);
    const todayDone = allTodos.filter((t) => t.done && t.completed_at && toDateString(t.completed_at)?.startsWith(today));
    let newRecordCount = 0;
    try {
        const records = userId
            ? await recordRepo.findByUser(userId, { limit: 100 })
            : await recordRepo.findByDevice(deviceId, { limit: 100 });
        newRecordCount = records.filter((r) => r.created_at && toDateString(r.created_at)?.startsWith(today)).length;
    }
    catch { /* non-critical */ }
    const tomorrowScheduled = pendingTodos.filter((t) => toDateString(t.scheduled_start)?.startsWith(tomorrow));
    const doneText = todayDone.length > 0
        ? todayDone.map((t) => `- ${t.text}`).join("\n")
        : "今日无完成事项";
    const pendingText = pendingTodos.slice(0, 5).map((t) => `- ${t.text}`).join("\n") || "无";
    const soulText = soul?.content ? soul.content.slice(0, 200) : "";
    const profileText = profile?.content ? profile.content.slice(0, 200) : "";
    const systemPrompt = EVENING_PROMPT
        .replace("{todayDone}", doneText)
        .replace("{todayPending}", pendingText)
        .replace("{newRecordCount}", String(newRecordCount))
        .replace("{soul}", soulText)
        .replace("{profile}", profileText);
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `今天: ${today}，请生成晚间总结。` },
    ];
    try {
        const response = await chatCompletion(messages, { json: true, temperature: 0.5, tier: "report" });
        const parsed = safeParseJson(response.content);
        if (!parsed)
            throw new Error("AI 返回格式异常");
        parsed.mode = "evening";
        parsed.generated_at = toLocalDateTime(tzNow());
        if (!parsed.stats) {
            parsed.stats = { done: todayDone.length, new_records: newRecordCount };
        }
        return parsed;
    }
    catch (err) {
        console.error(`[report] Evening generation failed: ${err.message}`);
        return {
            mode: "evening",
            generated_at: toLocalDateTime(tzNow()),
            headline: todayDone.length > 0 ? `今天完成了${todayDone.length}件事` : "安静的一天",
            accomplishments: todayDone.slice(0, 5).map((t) => t.text),
            tomorrow_preview: tomorrowScheduled.slice(0, 3).map((t) => t.text),
            stats: { done: todayDone.length, new_records: newRecordCount },
        };
    }
}
// ── 统一入口 ──
export async function generateReport(mode, deviceId, userId) {
    const resolvedMode = mode === "auto" ? resolveMode(tzNow().getHours()) : mode;
    switch (resolvedMode) {
        case "morning":
            return generateMorningReport(deviceId, userId);
        case "evening":
            return generateEveningReport(deviceId, userId);
        default:
            throw new Error(`Unsupported report mode: ${resolvedMode}`);
    }
}
//# sourceMappingURL=report.js.map