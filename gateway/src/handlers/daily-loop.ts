/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 *
 * v2 简化版：精简 prompt，移除认知报告/视角轮换/转达/目标等复杂逻辑
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo } from "../db/repositories/index.js";
import { generateChatDiary } from "./chat-daily-diary.js";
import { fmt } from "../lib/date-anchor.js";
import { dayRange } from "../lib/tz.js";

/** pg 驱动对 timestamp 列返回 Date 对象，需安全转为 string 以支持 startsWith 筛选 */
export function toDateString(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}
import * as briefingRepo from "../db/repositories/daily-briefing.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
import { safeParseJson } from "../lib/text-utils.js";

// ── Types ──

export interface BriefingResult {
  greeting: string;
  today_focus: string[];
  carry_over: string[];
  stats: { yesterday_done: number; yesterday_total: number };
}

export interface SummaryResult {
  headline: string;
  accomplishments: string[];
  tomorrow_preview: string[];
  stats: { done: number; new_records: number };
}

// ── Morning Briefing ──

export async function generateMorningBriefing(
  deviceId: string,
  userId?: string,
  forceRefresh?: boolean,
): Promise<BriefingResult> {
  const now = new Date();
  const today = fmt(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = fmt(yesterdayDate);

  // 当日持久缓存（仅 forceRefresh 时跳过）
  if (!forceRefresh) {
    try {
      const cached = userId
        ? await briefingRepo.findByUserAndDate(userId, today, "morning")
        : await briefingRepo.findByDeviceAndDate(deviceId, today, "morning");
      if (cached) {
        console.log(`[daily-loop] Using cached morning briefing for ${userId ?? deviceId}`);
        return cached.content as BriefingResult;
      }
    } catch (err: any) {
      console.warn(`[daily-loop] Briefing cache check failed: ${err.message}`);
    }
  }

  // 1. 待办事项
  const pendingTodos = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);

  const todayScheduled = pendingTodos.filter((t) =>
    toDateString(t.scheduled_start)?.startsWith(today),
  );
  const overdue = pendingTodos.filter((t) =>
    t.scheduled_end ? new Date(t.scheduled_end) < now : false,
  );

  // 2. 昨日统计 + 用户信息（并行加载）
  const [yesterdayStats, soul, profile] = await Promise.all([
    (() => {
      const yd = dayRange(yesterday);
      return userId
        ? todoRepo.countByUserDateRange(userId, yd.start, yd.end)
        : todoRepo.countByDateRange(deviceId, yd.start, yd.end);
    })(),
    loadSoul(deviceId, userId).catch(() => null),
    loadProfile(deviceId, userId).catch(() => null),
  ]);

  // 3. 构建 AI prompt
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;

  const todosText = pendingTodos.length > 0
    ? pendingTodos.slice(0, 10).map((t) => `- ${t.text}`).join("\n")
    : "暂无待办";

  const soulBlock = soul?.content
    ? `\n<user_soul>${soul.content.slice(0, 200)}</user_soul>`
    : "";
  const profileBlock = profile?.content
    ? `\n<user_profile>${profile.content.slice(0, 200)}</user_profile>`
    : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `根据用户画像生成个性化晨间问候。返回纯 JSON，不要 markdown 包裹。${soulBlock}${profileBlock}
{
  "greeting": "≤30字，基于用户画像的个性化问候，包含日期，语气自然温暖。不要提待办数量。",
  "today_focus": ["待办原文，按时间排序，最多5条。无待办时写一句引导语"],
  "carry_over": ["逾期待办，语气轻松"],
  "stats": {"yesterday_done": 数字, "yesterday_total": 数字}
}
空类别返回空数组。`,
    },
    {
      role: "user",
      content: `今天: ${dateStr}
待办(${pendingTodos.length}):
${todosText}
逾期(${overdue.length}): ${overdue.map((t) => t.text).join("、") || "无"}
昨日: ${yesterdayStats.done}/${yesterdayStats.total} 完成`,
    },
  ];

  try {
    const response = await chatCompletion(messages, {
      json: true,
      temperature: 0.5,
      tier: "report",
    });
    const parsed = safeParseJson<BriefingResult>(response.content);
    if (!parsed) {
      console.error("[daily-loop] Failed to parse briefing JSON, raw:", response.content.slice(0, 200));
      throw new Error("AI 返回格式异常");
    }

    if (!parsed.stats) {
      parsed.stats = { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total };
    }

    // Cache
    try {
      await briefingRepo.upsert(deviceId, today, "morning", parsed, userId);
    } catch (cacheErr: any) {
      console.warn(`[daily-loop] Failed to cache briefing: ${cacheErr.message}`);
    }
    console.log(`[daily-loop] Morning briefing generated for ${userId ?? deviceId}`);
    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI briefing generation failed: ${err.message}`);

    const fallback: BriefingResult = {
      greeting: `早上好！今天是${dateStr}`,
      today_focus: todayScheduled.slice(0, 5).map((t) => t.text),
      carry_over: overdue.map((t) => t.text),
      stats: { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total },
    };

    try { await briefingRepo.upsert(deviceId, today, "morning", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}

// ── Evening Summary ──

export async function generateEveningSummary(
  deviceId: string,
  userId?: string,
  forceRefresh?: boolean,
): Promise<SummaryResult> {
  const now = new Date();
  const today = fmt(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = fmt(tomorrowDate);

  // 当日持久缓存（仅 forceRefresh 时跳过）
  if (!forceRefresh) {
    try {
      const cached = userId
        ? await briefingRepo.findByUserAndDate(userId, today, "evening")
        : await briefingRepo.findByDeviceAndDate(deviceId, today, "evening");
      if (cached) {
        console.log(`[daily-loop] Using cached evening summary for ${userId ?? deviceId}`);
        return cached.content as SummaryResult;
      }
    } catch (err: any) {
      console.warn(`[daily-loop] Evening cache check failed: ${err.message}`);
    }
  }

  // 1. 今日完成的待办
  const allTodos = userId
    ? await todoRepo.findByUser(userId)
    : await todoRepo.findByDevice(deviceId);
  const todayDone = allTodos.filter(
    (t) => t.done && t.completed_at && toDateString(t.completed_at)?.startsWith(today),
  );

  // 2. 今日新记录数
  let newRecordCount = 0;
  try {
    const records = userId
      ? await recordRepo.findByUser(userId, { limit: 100 })
      : await recordRepo.findByDevice(deviceId, { limit: 100 });
    newRecordCount = records.filter(
      (r: any) => r.created_at && toDateString(r.created_at)?.startsWith(today),
    ).length;
  } catch {
    // non-critical
  }

  // 3. 明日排期 + 用户信息
  const [pending, soul, profile] = await Promise.all([
    (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)),
    loadSoul(deviceId, userId).catch(() => null),
    loadProfile(deviceId, userId).catch(() => null),
  ]);
  const tomorrowScheduled = pending.filter((t) =>
    toDateString(t.scheduled_start)?.startsWith(tomorrow),
  );

  // 4. 构建 AI prompt
  const soulBlock = soul?.content
    ? `\n<user_soul>${soul.content.slice(0, 200)}</user_soul>`
    : "";
  const profileBlock = profile?.content
    ? `\n<user_profile>${profile.content.slice(0, 200)}</user_profile>`
    : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `根据用户画像生成个性化晚间回顾。返回纯 JSON，不要 markdown 包裹。${soulBlock}${profileBlock}
{
  "headline": "≤30字，基于用户画像的温暖晚间回顾，语气俏皮自然。做了很多→跟他一起开心；什么都没做→'今天就这样了'比'无事项完成'真诚一万倍。绝对不要说'无事项完成''亦无待办遗留'这种公文腔。",
  "accomplishments": ["完成的事，具体到事项名"],
  "tomorrow_preview": ["明日排期/待处理，最多3条"],
  "stats": {"done": 数字, "new_records": 数字}
}
完成为空时 accomplishments 返回空数组。无明日安排时 tomorrow_preview 返回空数组。`,
    },
    {
      role: "user",
      content: `今日完成(${todayDone.length}): ${todayDone.map((t) => t.text).join("、") || "无"}
今日记录: ${newRecordCount} 条
明日排期(${tomorrowScheduled.length}): ${tomorrowScheduled.slice(0, 5).map((t) => t.text).join("、") || "无"}
待处理(${pending.length}): ${pending.slice(0, 5).map((t) => t.text).join("、") || "无"}`,
    },
  ];

  try {
    const response = await chatCompletion(messages, {
      json: true,
      temperature: 0.5,
      tier: "report",
    });
    const parsed = safeParseJson<SummaryResult>(response.content);
    if (!parsed) {
      console.error("[daily-loop] Failed to parse summary JSON, raw:", response.content.slice(0, 200));
      throw new Error("AI 返回格式异常");
    }

    if (!parsed.stats) {
      parsed.stats = { done: todayDone.length, new_records: newRecordCount };
    }
    if (!parsed.tomorrow_preview) {
      parsed.tomorrow_preview = tomorrowScheduled.slice(0, 3).map((t) => t.text);
    }

    // Cache
    try { await briefingRepo.upsert(deviceId, today, "evening", parsed, userId); } catch { /* ignore */ }

    // 异步生成聊天日记（不阻塞 evening summary 返回）
    if (userId) {
      generateChatDiary(deviceId, userId, today).catch(e =>
        console.warn(`[daily-loop] Chat diary failed: ${e.message}`),
      );
    }

    console.log(`[daily-loop] Evening summary generated for ${deviceId}`);
    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI summary generation failed: ${err.message}`);

    const fallback: SummaryResult = {
      headline: todayDone.length > 0 ? `今天搞定了${todayDone.length}件事，不错嘛` : "今天就这样了，也挺好的",
      accomplishments: todayDone.slice(0, 5).map((t) => t.text),
      tomorrow_preview: tomorrowScheduled.slice(0, 3).map((t) => t.text),
      stats: { done: todayDone.length, new_records: newRecordCount },
    };

    try { await briefingRepo.upsert(deviceId, today, "evening", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}
