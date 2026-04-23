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
import { dayRange, now as tzNow, toLocalDate, toLocalDateTime } from "../lib/tz.js";
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
  deviceId: string, // 已弃用，保留兼容签名
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
      const uid = userId ?? deviceId;
      const cached = await briefingRepo.findByUserAndDate(uid, today, "morning");
      if (cached) {
        console.log(`[daily-loop] Using cached morning briefing for ${uid}`);
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
    loaded = await loadWarmContext({ deviceId: userId ?? deviceId, userId, mode: "briefing" });
  } catch (err: any) {
    console.warn(`[daily-loop] loadWarmContext failed, using defaults: ${err.message}`);
  }

  // 2. 待办事项
  const uid = userId ?? deviceId;
  const pendingTodos = await todoRepo.findPendingByUser(uid);

  const todayScheduled = pendingTodos.filter((t) =>
    toLocalDateStr(t.scheduled_start) === today,
  );
  const todayScheduledIds = new Set(todayScheduled.map((t) => t.id));
  // 逾期判断：日期级比较（toLocalDateStr），不用时间戳级比较
  // carry_over 包含：
  //   1. 有 scheduled_end 且 toLocalDateStr(scheduled_end) < today 的
  //   2. 有 scheduled_start < today 但不在 todayScheduled 中的（排了过去日期但没完成）
  const overdue = pendingTodos.filter((t) => {
    // 已在今日排期中的不重复计入（用 ID 比较，避免引用比较脆弱性）
    if (todayScheduledIds.has(t.id)) return false;
    const endDate = toLocalDateStr(t.scheduled_end);
    // 如果 scheduled_end >= today，任务仍在进行中，不算逾期
    if (endDate && endDate >= today) return false;
    if (endDate && endDate < today) return true;
    const startDate = toLocalDateStr(t.scheduled_start);
    if (startDate && startDate < today) return true;
    return false;
  });

  // 3. 昨日统计
  const yesterdayStats = await (async () => {
    const yd = dayRange(yesterday);
    return todoRepo.countByUserDateRange(uid, yd.start, yd.end);
  })();

  // 4. 加载活跃目标 + 待办进度（目标脉搏）
  let goalPulseData: Array<{ title: string; done: number; total: number }> = [];
  try {
    const goals = await goalRepo.findActiveByUser(uid);
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

  // 只展示今日排期 + 逾期，移除全量 pending fallback（无排期的不出现在早报中）
  // 截断优先级：今日排期优先，逾期其次，总计不超过 10 条
  const maxTodos = 10;
  const shownTodayScheduled = todayScheduled.slice(0, maxTodos);
  const remainingSlots = maxTodos - shownTodayScheduled.length;
  const shownOverdue = overdue.slice(0, Math.max(0, remainingSlots));

  const todosText = shownTodayScheduled.length > 0
    ? shownTodayScheduled.map((t) => `- ${t.text}`).join("\n")
    : "今天没有排期的待办";

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
今日待办(${shownTodayScheduled.length}):
${todosText}
逾期(${shownOverdue.length}): ${shownOverdue.map((t) => t.text).join("、") || "无"}
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
      await briefingRepo.upsert(uid, today, "morning", parsed, userId);
    } catch (cacheErr: any) {
      console.warn(`[daily-loop] Failed to cache briefing: ${cacheErr.message}`);
    }
    console.log(`[daily-loop] Morning briefing generated for ${uid}`);
    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI briefing generation failed: ${err.message}`);

    const fallback: BriefingResult = {
      greeting: `早上好！今天是${dateStr}`,
      today_focus: shownTodayScheduled.map((t) => t.text),
      carry_over: shownOverdue.map((t) => t.text),
      goal_pulse: [],
      stats: { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total },
    };

    try { await briefingRepo.upsert(uid, today, "morning", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}

// ── Evening Summary ──

export async function generateEveningSummary(
  deviceId: string, // 已弃用，保留兼容签名
  userId?: string,
  forceRefresh?: boolean,
): Promise<SummaryResult | null> {
  const uid = userId ?? deviceId;

  // 检查 UserAgent 通知偏好
  if (await isBriefingDisabled(uid, "晚间回顾")) {
    console.log(`[daily-loop] Evening summary disabled by UserAgent for ${uid}`);
    return null;
  }

  const now = tzNow();
  const today = fmt(now);

  // 当日持久缓存（仅 forceRefresh 时跳过）
  if (!forceRefresh) {
    try {
      const cached = await briefingRepo.findByUserAndDate(uid, today, "evening");
      if (cached) {
        console.log(`[daily-loop] Using cached evening summary for ${uid}`);
        return cached.content as SummaryResult;
      }
    } catch (err: any) {
      console.warn(`[daily-loop] Evening cache check failed: ${err.message}`);
    }
  }

  // 1. 只加载 Soul（语气人格）— 晚报不需要 Memory/Wiki/工具规则
  let soul: string | undefined;
  try {
    const loaded = await loadWarmContext({ deviceId: uid, userId: uid, mode: "briefing" });
    soul = loaded.soul;
  } catch (err: any) {
    console.warn(`[daily-loop] loadWarmContext failed: ${err.message}`);
  }

  // 2. 今日完成的待办
  const todayRng = dayRange(today);
  const todayDone = await todoRepo.findCompletedByUserInRange(uid, todayRng.start, todayRng.end);

  // 3. 今日日记
  let diaryText = "";
  let newRecordCount = 0;
  try {
    const records = await recordRepo.findByUserAndDateRange(uid, todayRng.start, todayRng.end);
    newRecordCount = records.length;
    if (records.length > 0) {
      const transcripts = await transcriptRepo.findByRecordIds(records.map((r: any) => r.id));
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

  // 4. 无任何记录 → 不生成报告
  const hasContent = todayDone.length > 0 || diaryText.length > 0;
  if (!hasContent) {
    const empty: SummaryResult = {
      headline: "",
      accomplishments: [],
      insight: "",
      affirmation: "",
      tomorrow_preview: [],
      stats: { done: 0, new_records: newRecordCount },
    };
    try { await briefingRepo.upsert(uid, today, "evening", empty, userId); } catch { /* ignore */ }
    console.log(`[daily-loop] No content today, skip evening summary for ${uid}`);
    return empty;
  }

  // 5. 构建 prompt — 只传今日完成 + 今日日记，写 ≤100 字报告
  const doneList = todayDone.map((t) => {
    const timeStr = t.completed_at ? toLocalDateTime(t.completed_at).split(" ")[1] : "";
    return `- [${timeStr}] ${t.text}`;
  }).join("\n");

  const soulLine = soul ? `<soul>\n${soul}\n</soul>\n` : "";

  const systemContent = `${soulLine}你是用户的私人日报作者。根据今天的已完成待办和日记，写一段晚间回顾。

## 输出要求

返回纯 JSON：
{
  "headline": "≤100字的今日回顾",
  "accomplishments": ["完成事项，照抄原文即可"],
  "stats": {"done": number, "new_records": number}
}

## headline 写作规则

一段话，不超过 100 字。这是整篇晚报的全部内容。

写作视角——「陪伴者」：你全程在场，看着用户度过了这一天。

结构：「事实 → 我注意到的 → 一句收尾」
1. 从今天最有记忆点的事切入（具体事项名 / 日记原话）
2. 点出一个你看到的模式、变化、或值得记住的点
3. 一句话收尾——肯定、接纳、或留一个轻松的尾巴

## 表达 DNA

句式：
- 平均句长 ≤18 字。一个判断一句话
- 开头直入，禁止"今天是充实的一天""回顾今天"
- 结论先行，不铺垫
- 引用用户原话用「」标注
- 转折用"但"，不用"然而""不过"

禁用词：
"充实""丰富""不断""积极""良好""有效""合理""逐步""值得一提""总的来说""综上""忙碌"

确定性：
- 有数据（完成数、时间）→ 直接说
- 推测用户状态 → 用"看起来""像是"
- 信息不够 → 不编

正反例：
✓ "PPT终于交了，卡了三天的那个。下午连着回了5封邮件，看起来进入状态了。"
✓ "你说「核心问题其实不是融资」——这句话挺狠的，跟你最近一直在想的方向是一件事。"
✓ "就做了一件事，但那件事拖了一周了。动手就是最大的进展。"
✗ "今天完成了3项任务，工作效率良好，继续保持积极的状态。"
✗ "充实的一天，各项工作稳步推进，期待明天更好的表现。"

特殊情况：
- 只有待办没有日记 → 从完成节奏和事项类型中读信息
- 只有日记没有待办 → 聚焦日记内容，引用原话
- 日记和行为矛盾 → 直接说出张力，不抹平`;

  const userContent = [
    doneList ? `今日完成:\n${doneList}` : "",
    diaryText ? `今日日记:\n${diaryText}` : "",
  ].filter(Boolean).join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
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

    // 补全字段（向后兼容前端接口）
    if (!parsed.stats) parsed.stats = { done: todayDone.length, new_records: newRecordCount };
    if (!parsed.accomplishments) parsed.accomplishments = todayDone.slice(0, 5).map((t) => t.text);
    if (!parsed.insight) parsed.insight = "";
    if (!parsed.affirmation) parsed.affirmation = "";
    if (!parsed.tomorrow_preview) parsed.tomorrow_preview = [];

    // Cache
    try { await briefingRepo.upsert(uid, today, "evening", parsed, userId); } catch { /* ignore */ }

    // 异步生成聊天日记（不阻塞 evening summary 返回）
    if (userId) {
      generateChatDiary(uid, uid, today).catch(e =>
        console.warn(`[daily-loop] Chat diary failed: ${e.message}`),
      );
    }

    console.log(`[daily-loop] Evening summary generated for ${uid}`);
    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI summary generation failed: ${err.message}`);

    const fallback: SummaryResult = {
      headline: todayDone.length > 0 ? `今天搞定了${todayDone.length}件事` : "今天就这样了",
      accomplishments: todayDone.slice(0, 5).map((t) => t.text),
      insight: "",
      affirmation: "",
      tomorrow_preview: [],
      stats: { done: todayDone.length, new_records: newRecordCount },
    };

    try { await briefingRepo.upsert(uid, today, "evening", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}
