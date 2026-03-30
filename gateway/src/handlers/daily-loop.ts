/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 *
 * 设计原则：
 * - 晨间简报：聚焦今天要做的事（行动导向）
 * - 晚间回顾：聚焦今天发生了什么 + 预告未完成工作（认知+行动回顾）
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo, memoryRepo, goalRepo } from "../db/repositories/index.js";
import * as briefingRepo from "../db/repositories/daily-briefing.js";
import { MemoryManager } from "../memory/manager.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
import { generateAlerts } from "../cognitive/alerts.js";
import { generateCognitiveReport } from "../cognitive/report.js";
import { aiDiaryRepo } from "../db/repositories/index.js";
import { autoCollectVocabulary } from "../cognitive/auto-vocabulary.js";
import { safeParseJson } from "../lib/text-utils.js";

// ── Types ──

export interface BriefingResult {
  greeting: string;
  /** 今日最重要的 3-5 件事（排好优先级） */
  today_focus: string[];
  /** 活跃目标简况：目标名 + 今日相关待办数 */
  goal_progress: Array<{
    title: string;
    pending_count: number;
    today_todos: string[];
  }>;
  /** 逾期 / 昨日遗留事项 */
  carry_over: string[];
  /** 待转达 */
  relay_pending: Array<{
    person: string;
    context: string;
    todoId: string;
  }>;
  /** AI 可协助的事项建议 */
  ai_suggestions: string[];
  stats: { yesterday_done: number; yesterday_total: number; streak: number };
}

export interface SummaryResult {
  /** 今日回顾：完成了什么 */
  accomplishments: string[];
  /** 认知收获：今天的思考、领悟、想法变化 */
  cognitive_highlights: string[];
  /** 目标维度：哪些目标推进了 */
  goal_updates: Array<{
    title: string;
    completed_count: number;
    remaining_count: number;
    note: string;
  }>;
  /** 需要关注：跳过多次 / 有阻力的事项 */
  attention_needed: string[];
  /** 转达状态 */
  relay_summary: string[];
  stats: { done: number; new_records: number; new_strikes: number; relays_completed: number };
  /** 明日预告：结构化的明日待办预览 */
  tomorrow_preview: {
    scheduled: string[];
    carry_over: string[];
    follow_up: string[];
  };
}

// ── Morning Briefing ──

export async function generateMorningBriefing(
  deviceId: string,
  userId?: string,
): Promise<BriefingResult> {
  const today = new Date().toISOString().split("T")[0];

  // Check cache first (2-hour TTL)
  try {
    const cached = await briefingRepo.findFresh(deviceId, today, "morning", 2, userId);
    if (cached) {
      console.log(`[daily-loop] Using cached morning briefing for ${userId ?? deviceId}`);
      return cached.content as BriefingResult;
    }
  } catch (err: any) {
    console.warn(`[daily-loop] Briefing cache check failed: ${err.message}`);
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // 1. 待办事项（今日排期 / 逾期 / 未排期）
  const pendingTodos = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);

  const todayScheduled = pendingTodos.filter((t) =>
    t.scheduled_start?.startsWith(today),
  );
  const overdue = pendingTodos.filter((t) =>
    t.scheduled_end ? new Date(t.scheduled_end) < now : false,
  );
  const unscheduled = pendingTodos.filter((t) => !t.scheduled_start);
  const relayTodos = pendingTodos.filter(
    (t) => (t as any).category === "relay",
  );

  // 2. 活跃目标 + 每个目标下的今日待办
  let goalContext = "";
  try {
    const activeGoals = userId
      ? await goalRepo.findActiveByUser(userId)
      : await goalRepo.findActiveByDevice(deviceId);
    if (activeGoals.length > 0) {
      const topGoals = activeGoals.slice(0, 5);
      const allTodosForGoals = await goalRepo.findTodosByGoalIds(topGoals.map((g) => g.id));
      const goalLines: string[] = [];
      for (const g of topGoals) {
        const todos = allTodosForGoals.filter((t) => t.parent_id === g.id);
        const pending = todos.filter((t) => !t.done);
        const done = todos.filter((t) => t.done);
        goalLines.push(
          `- ${g.title}（已完成${done.length}/${todos.length}）待办: ${pending.slice(0, 3).map((t) => t.text).join("、") || "无"}`,
        );
      }
      goalContext = `\n## 活跃目标\n${goalLines.join("\n")}`;
    }
  } catch {
    // non-critical
  }

  // 3. Soul + Profile（个性化）
  let soulContent = "";
  let profileContent = "";
  try {
    const [soul, profile] = await Promise.all([
      loadSoul(deviceId, userId).catch(() => null),
      loadProfile(deviceId, userId).catch(() => null),
    ]);
    soulContent = soul?.content ?? "";
    profileContent = profile?.content ?? "";
  } catch {
    // non-critical
  }

  // 4. 昨日统计
  const yesterdayStart = `${yesterday}T00:00:00Z`;
  const yesterdayEnd = `${yesterday}T23:59:59Z`;
  const yesterdayStats = userId
    ? await todoRepo.countByUserDateRange(userId, yesterdayStart, yesterdayEnd)
    : await todoRepo.countByDateRange(deviceId, yesterdayStart, yesterdayEnd);

  // 5. 连续记录天数（单次 SQL 查询）
  let streak = 0;
  try {
    streak = await todoRepo.getStreak({ userId: userId ?? undefined, deviceId });
  } catch {
    // non-critical
  }

  // 6. 构建 AI prompt — 聚焦今天
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;

  const formatTodo = (t: any) => {
    const domain = t.domain ? `[${t.domain}]` : "";
    const impact = t.impact ? `(影响:${t.impact})` : "";
    const aiTag = t.ai_actionable ? " *AI可协助*" : "";
    return `${domain} ${t.text} ${impact}${aiTag}`.trim();
  };

  const todosContext = [
    todayScheduled.length > 0
      ? `今日排期(${todayScheduled.length}): ${todayScheduled.map(formatTodo).join("; ")}`
      : "",
    overdue.length > 0
      ? `逾期待处理(${overdue.length}): ${overdue.map(formatTodo).join("; ")}`
      : "",
    unscheduled.length > 0
      ? `未排期(${unscheduled.length}): ${unscheduled.slice(0, 10).map(formatTodo).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const aiActionableItems = pendingTodos.filter((t: any) => t.ai_actionable);
  const aiActionableContext = aiActionableItems.length > 0
    ? `\n\n## AI可协助的事项\n${aiActionableItems.map((t: any) => `- ${t.text}`).join("\n")}`
    : "";

  const relayContext =
    relayTodos.length > 0
      ? relayTodos
          .map((t) => {
            const meta = (t as any).relay_meta;
            return `- ${t.text} (${meta?.direction === "outgoing" ? "需转达给" : "来自"}${meta?.target_person || meta?.source_person || "未知"})`;
          })
          .join("\n")
      : "无";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是用户的个人助手，正在生成晨间简报。简报的核心目的：帮用户快速了解今天要做什么。
${soulContent ? `你的人设：\n${soulContent}\n` : ""}${profileContent ? `用户画像：\n${profileContent}\n` : ""}
规则：
- 聚焦行动：今天需要做的事、需要推进的目标
- 逾期事项放入 carry_over，提醒但不制造焦虑
- AI 可协助的事项放入 ai_suggestions，给出具体建议
- 不要回顾昨天的认知/思考（那是晚间回顾的事）
- 保持简洁务实，每条不超过20字

返回 JSON：
{
  "greeting": "个性化问候，包含日期",
  "today_focus": ["今日最重要的3-5件事，按优先级排序"],
  "goal_progress": [{"title":"目标名","pending_count":待办数,"today_todos":["相关待办"]}],
  "carry_over": ["逾期/昨日遗留事项"],
  "relay_pending": [{"person":"人名","context":"事由","todoId":"id"}],
  "ai_suggestions": ["AI可以帮忙做的事+建议"],
  "stats": {"yesterday_done": 数字, "yesterday_total": 数字, "streak": 数字}
}
空类别返回空数组。`,
    },
    {
      role: "user",
      content: `今天: ${dateStr}

## 待办事项
${todosContext || "暂无待办"}
${goalContext}

## 待转达
${relayContext}
${aiActionableContext}

## 昨日统计
完成: ${yesterdayStats.done}/${yesterdayStats.total}
连续记录: ${streak} 天`,
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

    // 确保 stats 不为空
    if (!parsed.stats) {
      parsed.stats = {
        yesterday_done: yesterdayStats.done,
        yesterday_total: yesterdayStats.total,
        streak,
      };
    }

    // 补全 relay todoId
    if (parsed.relay_pending && relayTodos.length > 0) {
      for (const rp of parsed.relay_pending) {
        if (!rp.todoId) {
          const match = relayTodos.find(
            (t) => t.text.includes(rp.person) || t.text.includes(rp.context),
          );
          if (match) rp.todoId = match.id;
        }
      }
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

    // Fallback：直接用原始数据
    const fallback: BriefingResult = {
      greeting: `早上好！今天是${dateStr}`,
      today_focus: todayScheduled.slice(0, 5).map((t) => t.text),
      goal_progress: [],
      carry_over: overdue.map((t) => t.text),
      relay_pending: relayTodos.map((t) => ({
        person: (t as any).relay_meta?.target_person || "",
        context: t.text,
        todoId: t.id,
      })),
      ai_suggestions: [],
      stats: {
        yesterday_done: yesterdayStats.done,
        yesterday_total: yesterdayStats.total,
        streak,
      },
    };

    try { await briefingRepo.upsert(deviceId, today, "morning", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}

// ── Evening Summary ──

export async function generateEveningSummary(
  deviceId: string,
  userId?: string,
): Promise<SummaryResult> {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Check cache
  try {
    const cached = await briefingRepo.findFresh(deviceId, today, "evening", 2, userId);
    if (cached) {
      console.log(`[daily-loop] Using cached evening summary for ${userId ?? deviceId}`);
      return cached.content as SummaryResult;
    }
  } catch (err: any) {
    console.warn(`[daily-loop] Evening cache check failed: ${err.message}`);
  }

  // 1. 今日完成的待办
  const allTodos = userId
    ? await todoRepo.findByUser(userId)
    : await todoRepo.findByDevice(deviceId);
  const todayDone = allTodos.filter(
    (t) => t.done && t.completed_at && t.completed_at.startsWith(today),
  );

  // 2. 今日新记录数
  let newRecordCount = 0;
  try {
    const records = userId
      ? await recordRepo.findByUser(userId, { limit: 100 })
      : await recordRepo.findByDevice(deviceId, { limit: 100 });
    newRecordCount = records.filter(
      (r: any) => r.created_at && r.created_at.startsWith(today),
    ).length;
  } catch {
    // non-critical
  }

  // 3. 仍然待处理的事项
  const pending = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);

  // 4. 转达状态
  const relayTodos = allTodos.filter(
    (t) => (t as any).category === "relay",
  );
  const relaysCompleted = relayTodos.filter(
    (t) => t.done && t.completed_at && t.completed_at.startsWith(today),
  ).length;
  const relaysPending = relayTodos.filter((t) => !t.done);

  // 5. Soul + Profile
  let soulContent = "";
  let profileContent = "";
  try {
    const [soul, profile] = await Promise.all([
      loadSoul(deviceId, userId).catch(() => null),
      loadProfile(deviceId, userId).catch(() => null),
    ]);
    soulContent = soul?.content ?? "";
    profileContent = profile?.content ?? "";
  } catch {
    // non-critical
  }

  // 6. 认知报告（今日 Strike 统计、想法变化、新主题）— 回顾的核心
  let cognitiveSection = "";
  let totalStrikes = 0;
  try {
    const ownerOpts = userId ? { userId } : { deviceId };
    const report = await generateCognitiveReport(ownerOpts);
    if (!report.is_empty) {
      const lines: string[] = [];
      const { today_strikes: ts } = report;
      totalStrikes = ts.perceive + ts.judge + ts.realize + ts.intend + ts.feel;
      if (totalStrikes > 0) {
        lines.push(`今日思考: 感知${ts.perceive}次, 判断${ts.judge}次, 领悟${ts.realize}次, 意图${ts.intend}个, 感受${ts.feel}次`);
      }
      if (report.contradictions.length > 0) {
        const cList = report.contradictions.slice(0, 3).map(
          (c) => `「${c.strikeA_nucleus.slice(0, 20)}」↔「${c.strikeB_nucleus.slice(0, 20)}」`,
        );
        lines.push(`想法变化: ${cList.join("; ")}`);
      }
      if (report.cluster_changes.length > 0) {
        lines.push(`新涌现主题: ${report.cluster_changes.map((c) => c.name).join(", ")}`);
      }
      if (report.behavior_drift.completion_rate > 0) {
        lines.push(`行动完成率: ${Math.round(report.behavior_drift.completion_rate * 100)}%`);
      }
      if (lines.length > 0) {
        cognitiveSection = `\n## 今日认知统计\n${lines.join("\n")}\n请用"想法演进""新的联系""思路变化"等温和表述编入 cognitive_highlights。如果有领悟(realize)，重点提及。`;
      }
    }
  } catch {
    // non-critical
  }

  // 6b. 认知矛盾提醒（供回顾反思）
  let alertSection = "";
  try {
    const alerts = await generateAlerts(userId ? { userId } : { deviceId });
    if (alerts.length > 0) {
      const alertLines = alerts.slice(0, 3).map((a) => {
        const aShort = a.strikeA.nucleus.slice(0, 30);
        const bShort = a.strikeB.nucleus.slice(0, 30);
        return `- 关于「${aShort}」和「${bShort}」，你的想法有些变化`;
      });
      alertSection = `\n## 思考变化\n${alertLines.join("\n")}\n请在 cognitive_highlights 中温和提及。`;
    }
  } catch {
    // non-critical
  }

  // 6c. AI 日记中的认知摘要
  let cognitiveDigest = "";
  try {
    const diaryEntry = userId
      ? await aiDiaryRepo.findByUser(userId, "ai-self", today)
      : await aiDiaryRepo.findFull(deviceId, "ai-self", today);
    if (diaryEntry?.full_content) {
      const lines = diaryEntry.full_content
        .split("\n")
        .filter((l) => l.includes("[认知摘要]"))
        .map((l) => l.replace("[认知摘要]", "").trim());
      if (lines.length > 0) {
        cognitiveDigest = `\n## 今日思考发现\n${lines.join("；")}`;
      }
    }
  } catch {
    // non-critical
  }

  // 7. 目标维度回顾
  let goalSection = "";
  try {
    const activeGoals = userId
      ? await goalRepo.findActiveByUser(userId)
      : await goalRepo.findActiveByDevice(deviceId);
    if (activeGoals.length > 0) {
      const topGoals = activeGoals.slice(0, 5);
      const allTodosForGoals = await goalRepo.findTodosByGoalIds(topGoals.map((g) => g.id));
      const goalLines: string[] = [];
      for (const g of topGoals) {
        const todos = allTodosForGoals.filter((t) => t.parent_id === g.id);
        const completedToday = todos.filter(
          (t) => t.done && t.completed_at?.startsWith(today),
        );
        const remaining = todos.filter((t) => !t.done);
        goalLines.push(
          `- ${g.title}: 今日完成${completedToday.length}项, 剩余${remaining.length}项`,
        );
      }
      goalSection = `\n## 目标进度\n${goalLines.join("\n")}\n请在 goal_updates 中总结每个目标的推进情况。`;
    }
  } catch {
    // non-critical
  }

  // 8. 跳过 alert + 结果追踪
  let skipAlertSection = "";
  let resultTrackingSection = "";
  try {
    const ownerOpts = userId ? { userId } : { deviceId };
    const { getSkipAlerts, getResultTrackingPrompts } = await import("../cognitive/action-tracking.js");
    const [skipAlerts, resultPrompts] = await Promise.all([
      getSkipAlerts(ownerOpts),
      getResultTrackingPrompts(ownerOpts),
    ]);
    if (skipAlerts.length > 0) {
      skipAlertSection = `\n## 需要关注的行动\n${skipAlerts.map((a) => `- ${a.description}`).join("\n")}\n请在 attention_needed 中温和提及。`;
    }
    if (resultPrompts.length > 0) {
      resultTrackingSection = `\n## 待跟进结果\n${resultPrompts.map((p) => `- ${p.prompt}`).join("\n")}\n请在 tomorrow_preview.follow_up 中包含。`;
    }
  } catch {
    // non-critical
  }

  // 9. 明日排期（提前查询明日待办）
  const tomorrowScheduled = pending.filter((t) =>
    t.scheduled_start?.startsWith(tomorrow),
  );
  const tomorrowSection = tomorrowScheduled.length > 0
    ? `\n## 明日已排期\n${tomorrowScheduled.slice(0, 5).map((t) => `- ${t.text}`).join("\n")}`
    : "";

  // 10. 构建 AI prompt — 聚焦回顾 + 明日预告
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是用户的个人助手，正在生成每日回顾。回顾的核心目的：帮用户理解今天发生了什么，感受进步，并为明天做准备。
${soulContent ? `你的人设：\n${soulContent}\n` : ""}${profileContent ? `用户画像：\n${profileContent}\n` : ""}
规则：
- 回顾部分：完成了什么 + 思考了什么 + 目标推进了多少
- 认知维度：将今日的思考发现、想法变化用温暖的语言转述（不用技术术语）
- 如果有领悟(realize)类收获，重点肯定
- attention_needed：温和提及跳过多次的事项，不要制造压力
- tomorrow_preview：结构化的明日预告（已排期 + 遗留 + 跟进），帮用户安心入睡
- 保持简洁，每条不超过20字

返回 JSON：
{
  "accomplishments": ["今日完成的重要事项"],
  "cognitive_highlights": ["今日思考收获，用温暖自然的语言"],
  "goal_updates": [{"title":"目标名","completed_count":今日完成数,"remaining_count":剩余数,"note":"一句话总结"}],
  "attention_needed": ["需要关注的事项（跳过多次/有阻力）"],
  "relay_summary": ["转达事项状态"],
  "stats": {"done": 数字, "new_records": 数字, "new_strikes": 数字, "relays_completed": 数字},
  "tomorrow_preview": {
    "scheduled": ["明日已排期的事"],
    "carry_over": ["今日遗留，明天继续"],
    "follow_up": ["需要跟进确认结果的事"]
  }
}
空类别返回空数组/空对象。`,
    },
    {
      role: "user",
      content: `## 今日完成 (${todayDone.length})
${todayDone.map((t) => `- ${t.text}`).join("\n") || "无"}

## 仍待处理 (${pending.length})
${pending.slice(0, 10).map((t) => `- ${t.text}`).join("\n") || "无"}

## 转达状态
已完成: ${relaysCompleted}, 待处理: ${relaysPending.length}
${relaysPending.map((t) => `- ${t.text}`).join("\n") || "无待转达"}

## 今日新记录: ${newRecordCount} 条
${cognitiveDigest}${cognitiveSection}${alertSection}${goalSection}${skipAlertSection}${resultTrackingSection}${tomorrowSection}`,
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

    // 确保 stats 不为空
    if (!parsed.stats) {
      parsed.stats = {
        done: todayDone.length,
        new_records: newRecordCount,
        new_strikes: totalStrikes,
        relays_completed: relaysCompleted,
      };
    }

    // 确保 tomorrow_preview 结构存在
    if (!parsed.tomorrow_preview) {
      parsed.tomorrow_preview = {
        scheduled: tomorrowScheduled.slice(0, 5).map((t) => t.text),
        carry_over: pending.slice(0, 5).map((t) => t.text),
        follow_up: [],
      };
    }

    // Cache
    try { await briefingRepo.upsert(deviceId, today, "evening", parsed, userId); } catch { /* ignore */ }

    // 将 tomorrow_preview 存入 memory，供明日简报参考
    try {
      const preview = parsed.tomorrow_preview;
      const seeds = [
        ...preview.scheduled.map((s) => `[排期] ${s}`),
        ...preview.carry_over.map((s) => `[遗留] ${s}`),
        ...preview.follow_up.map((s) => `[跟进] ${s}`),
      ];
      if (seeds.length > 0) {
        const memoryManager = new MemoryManager();
        await memoryManager.maybeCreateMemory(
          deviceId,
          `明日预告: ${seeds.join("; ")}`,
          today,
          userId,
        );
      }
    } catch {
      // non-critical
    }

    // 自动词汇收集（不阻塞返回）
    autoCollectVocabulary(deviceId, userId).catch((err) => {
      console.warn(`[daily-loop] Auto vocabulary collection failed: ${err.message}`);
    });

    console.log(`[daily-loop] Evening summary generated for ${deviceId}`);
    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI summary generation failed: ${err.message}`);

    const fallback: SummaryResult = {
      accomplishments: todayDone.slice(0, 5).map((t) => t.text),
      cognitive_highlights: [],
      goal_updates: [],
      attention_needed: [],
      relay_summary: relaysPending.map((t) => `待转达: ${t.text}`),
      stats: {
        done: todayDone.length,
        new_records: newRecordCount,
        new_strikes: totalStrikes,
        relays_completed: relaysCompleted,
      },
      tomorrow_preview: {
        scheduled: tomorrowScheduled.slice(0, 5).map((t) => t.text),
        carry_over: pending.slice(0, 5).map((t) => t.text),
        follow_up: [],
      },
    };

    try { await briefingRepo.upsert(deviceId, today, "evening", fallback, userId); } catch { /* ignore */ }
    return fallback;
  }
}
