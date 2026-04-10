/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 *
 * v2.1: 接入 loadWarmContext + buildSystemPrompt 架构
 * - Soul 完整注入（不截断）
 * - UserAgent 通知偏好检查
 * - Memory/Wiki 注入
 * - 早报新增目标脉搏（goal_pulse）
 * - 晚报新增日记洞察（insight）和每日肯定（affirmation）
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo, goalRepo, transcriptRepo, userAgentRepo } from "../db/repositories/index.js";
import { generateChatDiary } from "./chat-daily-diary.js";
import { fmt } from "../lib/date-anchor.js";
import { dayRange, now as tzNow, toLocalDate } from "../lib/tz.js";
import { addDays as dfAddDays } from "date-fns";

/** pg 驱动对 timestamp 列返回 Date 对象，安全转为本地日期字符串（Asia/Shanghai） */
export function toLocalDateStr(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return toLocalDate(v);
  if (typeof v === "string") return toLocalDate(v);
  return null;
}
import * as briefingRepo from "../db/repositories/daily-briefing.js";
import { safeParseJson } from "../lib/text-utils.js";
import { loadWarmContext } from "../context/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";

// ── Types ──

export interface BriefingResult {
  greeting: string;
  today_focus: string[];
  carry_over: string[];
  goal_pulse: Array<{ title: string; progress: string }>; // 新增：目标脉搏
  stats: { yesterday_done: number; yesterday_total: number };
}

export interface SummaryResult {
  headline: string;
  accomplishments: string[];
  insight: string;         // 新增：日记洞察
  affirmation: string;     // 新增：每日肯定
  tomorrow_preview: string[];
  stats: { done: number; new_records: number };
}

// ── UserAgent 通知偏好检查 ──

export async function isBriefingDisabled(
  userId: string | undefined,
  type: "晨间简报" | "晚间回顾",
): Promise<boolean> {
  if (!userId) return false;
  try {
    const ua = await userAgentRepo.findByUser(userId);
    if (!ua) return false;
    const lines = ua.content.split("\n");
    for (const line of lines) {
      if (line.includes(type) && line.includes("关闭")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Morning Briefing ──

export async function generateMorningBriefing(
  deviceId: string,
  userId?: string,
  forceRefresh?: boolean,
): Promise<BriefingResult | null> {
  // 检查 UserAgent 通知偏好
  if (await isBriefingDisabled(userId, "晨间简报")) {
    console.log(`[daily-loop] Morning briefing disabled by UserAgent for ${userId}`);
    return null;
  }

  const now = tzNow();
  const today = fmt(now);
  const yesterday = fmt(dfAddDays(now, -1));

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

  // 1. 加载上下文（v2 架构）— 失败时 graceful degrade
  let loaded: Awaited<ReturnType<typeof loadWarmContext>> = {
    soul: undefined, userProfile: undefined, userAgent: undefined,
    memories: [], rawMemories: [], wikiContext: undefined,
    goals: [],
  };
  try {
    loaded = await loadWarmContext({ deviceId, userId, mode: "briefing" });
  } catch (err: any) {
    console.warn(`[daily-loop] loadWarmContext failed, using defaults: ${err.message}`);
  }

  // 2. 待办事项
  const pendingTodos = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);

  const todayScheduled = pendingTodos.filter((t) =>
    toLocalDateStr(t.scheduled_start) === today,
  );
  const overdue = pendingTodos.filter((t) =>
    t.scheduled_end ? new Date(t.scheduled_end) < now : false,
  );

  // 3. 昨日统计
  const yesterdayStats = await (async () => {
    const yd = dayRange(yesterday);
    return userId
      ? todoRepo.countByUserDateRange(userId, yd.start, yd.end)
      : todoRepo.countByDateRange(deviceId, yd.start, yd.end);
  })();

  // 4. 加载活跃目标 + 待办进度（目标脉搏）
  let goalPulseData: Array<{ title: string; done: number; total: number }> = [];
  try {
    const goals = userId ? await goalRepo.findActiveByUser(userId) : [];
    const limitedGoals = goals.slice(0, 5);
    const goalTodos = limitedGoals.length > 0
      ? await goalRepo.findTodosByGoalIds(limitedGoals.map((g) => g.id))
      : [];
    for (const g of limitedGoals) {
      const gTodos = goalTodos.filter((t) => t.parent_id === g.id);
      const done = gTodos.filter((t) => t.done).length;
      goalPulseData.push({ title: g.title, done, total: gTodos.length });
    }
  } catch (err: any) {
    console.warn(`[daily-loop] Goal pulse loading failed: ${err.message}`);
  }

  // 5. 构建 system prompt（v2 架构）
  const systemPromptBase = buildSystemPrompt({
    agent: "briefing",
    soul: loaded.soul,
    userAgent: loaded.userAgent,
    userProfile: loaded.userProfile,
    memory: loaded.memories,
    wikiContext: loaded.wikiContext,
    skills: [],
  });

  // 6. 构建 AI 消息
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;

  const todosText = pendingTodos.length > 0
    ? pendingTodos.slice(0, 10).map((t) => `- ${t.text}`).join("\n")
    : "暂无待办";

  const goalPulseText = goalPulseData.length > 0
    ? goalPulseData.map((g) => `- ${g.title}: ${g.done}/${g.total}`).join("\n")
    : "暂无进行中的目标";

  const systemContent = `${systemPromptBase}

根据用户画像生成个性化晨间问候。返回纯 JSON，不要 markdown 包裹。
{
  "greeting": "≤30字，基于用户画像的个性化问候，包含日期，语气自然温暖。不要提待办数量。",
  "today_focus": ["待办原文，按时间排序，最多5条。无待办时写一句引导语"],
  "carry_over": ["逾期待办，语气轻松"],
  "goal_pulse": [{"title": "目标名", "progress": "done/total"}],
  "stats": {"yesterday_done": 数字, "yesterday_total": 数字}
}
空类别返回空数组。`;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent,
    },
    {
      role: "user",
      content: `今天: ${dateStr}
待办(${pendingTodos.length}):
${todosText}
逾期(${overdue.length}): ${overdue.map((t) => t.text).join("、") || "无"}
昨日: ${yesterdayStats.done}/${yesterdayStats.total} 完成
目标脉搏:
${goalPulseText}`,
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
    // 新字段默认值
    if (!parsed.goal_pulse) parsed.goal_pulse = [];

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
      goal_pulse: [],
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
): Promise<SummaryResult | null> {
  // 检查 UserAgent 通知偏好
  if (await isBriefingDisabled(userId, "晚间回顾")) {
    console.log(`[daily-loop] Evening summary disabled by UserAgent for ${userId}`);
    return null;
  }

  const now = tzNow();
  const today = fmt(now);
  const tomorrow = fmt(dfAddDays(now, 1));

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

  // 1. 加载上下文（v2 架构）— 失败时 graceful degrade
  let loaded: Awaited<ReturnType<typeof loadWarmContext>> = {
    soul: undefined, userProfile: undefined, userAgent: undefined,
    memories: [], rawMemories: [], wikiContext: undefined,
    goals: [],
  };
  try {
    loaded = await loadWarmContext({ deviceId, userId, mode: "briefing" });
  } catch (err: any) {
    console.warn(`[daily-loop] loadWarmContext failed, using defaults: ${err.message}`);
  }

  // 2. 今日完成的待办
  const allTodos = userId
    ? await todoRepo.findByUser(userId)
    : await todoRepo.findByDevice(deviceId);
  const todayDone = allTodos.filter(
    (t) => t.done && t.completed_at && toLocalDateStr(t.completed_at) === today,
  );

  // 3. 今日新记录数
  let newRecordCount = 0;
  try {
    const records = userId
      ? await recordRepo.findByUser(userId, { limit: 100 })
      : await recordRepo.findByDevice(deviceId, { limit: 100 });
    newRecordCount = records.filter(
      (r: any) => r.created_at && toLocalDateStr(r.created_at) === today,
    ).length;
  } catch {
    // non-critical
  }

  // 4. 明日排期
  const pending = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);
  const tomorrowScheduled = pending.filter((t) =>
    toLocalDateStr(t.scheduled_start) === tomorrow,
  );

  // 5. 加载今日日记（record + transcript）
  let diaryText = "";
  if (userId) {
    try {
      const todayRng = dayRange(today);
      const records = await recordRepo.findByUserAndDateRange(userId, todayRng.start, todayRng.end);
      if (records.length > 0) {
        const transcripts = await transcriptRepo.findByRecordIds(records.map((r: any) => r.id));
        // 按完整 record 边界截断到 2000 字（至少保留第一条）
        let charCount = 0;
        const parts: string[] = [];
        for (const t of transcripts) {
          if (parts.length > 0 && charCount + t.text.length > 2000) break;
          parts.push(charCount + t.text.length > 2000 ? t.text.slice(0, 2000) : t.text);
          charCount += parts[parts.length - 1].length;
        }
        diaryText = parts.join("\n\n");
      }
    } catch (err: any) {
      console.warn(`[daily-loop] Failed to load diary: ${err.message}`);
    }
  }

  // 6. 构建 system prompt（v2 架构）
  const systemPromptBase = buildSystemPrompt({
    agent: "briefing",
    soul: loaded.soul,
    userAgent: loaded.userAgent,
    userProfile: loaded.userProfile,
    memory: loaded.memories,
    wikiContext: loaded.wikiContext,
    skills: [],
  });

  const diaryInstruction = diaryText
    ? `\n对日记进行洞察：
- 准确描述用户今天的感受和状态（不是泛泛总结）
- 抽象出更高层级的模式/趋势
- 如果有矛盾或有趣的点，指出来`
    : "";

  const systemContent = `${systemPromptBase}

根据用户画像生成个性化晚间回顾。返回纯 JSON，不要 markdown 包裹。
{
  "headline": "≤30字，基于用户画像的温暖晚间回顾，语气俏皮自然。做了很多→跟他一起开心；什么都没做→'今天就这样了'比'无事项完成'真诚一万倍。绝对不要说'无事项完成''亦无待办遗留'这种公文腔。",
  "accomplishments": ["完成的事，具体到事项名"],
  "insight": "日记洞察 — 准确描述+高阶抽象，2-4句话。无日记时返回空字符串。",
  "affirmation": "一句真诚的每日肯定：基于今天实际做的事，不空洞。什么都没做→'今天休息也是一种选择'类型的接纳。语气匹配灵魂人格。",
  "tomorrow_preview": ["明日排期/待处理，最多3条"],
  "stats": {"done": 数字, "new_records": 数字}
}
完成为空时 accomplishments 返回空数组。无明日安排时 tomorrow_preview 返回空数组。${diaryInstruction}`;

  const diaryBlock = diaryText ? `\n今日日记:\n${diaryText}` : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent,
    },
    {
      role: "user",
      content: `今日完成(${todayDone.length}): ${todayDone.map((t) => t.text).join("、") || "无"}
今日记录: ${newRecordCount} 条
明日排期(${tomorrowScheduled.length}): ${tomorrowScheduled.slice(0, 5).map((t) => t.text).join("、") || "无"}
待处理(${pending.length}): ${pending.slice(0, 5).map((t) => t.text).join("、") || "无"}${diaryBlock}`,
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
    // 新字段默认值
    if (!parsed.insight) parsed.insight = "";
    if (!parsed.affirmation) parsed.affirmation = "";

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
      insight: "",
      affirmation: "",
      tomorrow_preview: tomorrowScheduled.slice(0, 3).map((t) => t.text),
      stats: { done: todayDone.length, new_records: newRecordCount },
    };

    try { await briefingRepo.upsert(deviceId, today, "evening", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}
