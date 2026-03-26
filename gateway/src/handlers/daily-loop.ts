/**
 * Daily Loop Handler — generates morning briefings and evening summaries.
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo, memoryRepo } from "../db/repositories/index.js";
import * as briefingRepo from "../db/repositories/daily-briefing.js";
import { MemoryManager } from "../memory/manager.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
import { generateAlerts } from "../cognitive/alerts.js";
import { generateCognitiveReport } from "../cognitive/report.js";
import { aiDiaryRepo } from "../db/repositories/index.js";

// ── Types ──

export interface BriefingResult {
  greeting: string;
  priority_items: string[];
  unfinished: string[];
  relay_pending: Array<{
    person: string;
    context: string;
    todoId: string;
  }>;
  followups: string[];
  stats: { yesterday_done: number; yesterday_total: number; streak: number };
}

export interface SummaryResult {
  accomplishments: string[];
  pending_items: string[];
  relay_summary: string[];
  stats: { done: number; new_records: number; relays_completed: number };
  tomorrow_seeds: string[];
}

// ── Morning Briefing ──

export async function generateMorningBriefing(
  deviceId: string,
  userId?: string,
): Promise<BriefingResult> {
  const today = new Date().toISOString().split("T")[0];

  // Check cache first (2-hour TTL) — gracefully handle missing table
  try {
    const cached = await briefingRepo.findFresh(deviceId, today, "morning", 2);
    if (cached) {
      console.log(`[daily-loop] Using cached morning briefing for ${deviceId}`);
      return cached.content as BriefingResult;
    }
  } catch (err: any) {
    console.warn(`[daily-loop] Briefing cache check failed (table may not exist): ${err.message}`);
  }

  // 1. Load all pending todos
  const pendingTodos = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);

  // Categorize todos
  const now = new Date();
  const todayScheduled = pendingTodos.filter((t) => {
    if (!t.scheduled_start) return false;
    return t.scheduled_start.startsWith(today);
  });
  const overdue = pendingTodos.filter((t) => {
    if (!t.scheduled_end) return false;
    return new Date(t.scheduled_end) < now;
  });
  const unscheduled = pendingTodos.filter((t) => !t.scheduled_start);

  // Relay todos
  const relayTodos = pendingTodos.filter(
    (t) => (t as any).category === "relay",
  );

  // 2. Load memory context (last 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  let memories: string[] = [];
  try {
    const memoryManager = new MemoryManager();
    memories = await memoryManager.loadContext(deviceId, {
      start: sevenDaysAgo,
      end: yesterday,
    }, userId);
  } catch (err: any) {
    console.warn(`[daily-loop] Memory load failed: ${err.message}`);
  }

  // 3. Load soul + profile for personalization
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

  // 3b. Load cognitive alerts (recent contradictions/changes)
  let cognitiveHints: string[] = [];
  try {
    const uid = userId ?? deviceId;
    const alerts = await generateAlerts(uid);
    cognitiveHints = alerts.slice(0, 3).map((a) => {
      // Convert to warm, non-technical language
      const aShort = a.strikeA.nucleus.slice(0, 30);
      const bShort = a.strikeB.nucleus.slice(0, 30);
      return `你之前关于「${aShort}」的想法似乎有些变化（与「${bShort}」），可以在复盘中聊聊`;
    });
  } catch {
    // non-critical
  }

  // 3c. Load cognitive report (yesterday's)
  let cognitiveReportSection = "";
  try {
    const uid = userId ?? deviceId;
    const report = await generateCognitiveReport(uid);
    if (!report.is_empty) {
      const lines: string[] = [];
      const { today_strikes: ts } = report;
      const total = ts.perceive + ts.judge + ts.realize + ts.intend + ts.feel;
      if (total > 0) {
        lines.push(`认知动态: 感知${ts.perceive} 判断${ts.judge} 领悟${ts.realize} 意图${ts.intend} 感受${ts.feel}`);
      }
      if (report.contradictions.length > 0) {
        const cList = report.contradictions.slice(0, 3).map(
          (c) => `「${c.strikeA_nucleus.slice(0, 20)}」↔「${c.strikeB_nucleus.slice(0, 20)}」`,
        );
        lines.push(`想法变化: ${cList.join("; ")}`);
      }
      if (report.cluster_changes.length > 0) {
        lines.push(`新主题: ${report.cluster_changes.map((c) => c.name).join(", ")}`);
      }
      if (report.behavior_drift.intend_count > 0) {
        const { intend_count, todo_completed, completion_rate } = report.behavior_drift;
        lines.push(`行动力: ${intend_count}个目标, 完成${todo_completed}个(${Math.round(completion_rate * 100)}%)`);
      }
      if (lines.length > 0) {
        cognitiveReportSection = `\n## 认知洞察\n${lines.join("\n")}\n将这些洞察自然编入简报。不要使用"矛盾""聚类""极性"等技术术语，用温暖自然的口吻转述。`;
      }
    }
  } catch {
    // non-critical
  }

  // 4. Yesterday's stats
  const yesterdayStart = `${yesterday}T00:00:00Z`;
  const yesterdayEnd = `${yesterday}T23:59:59Z`;
  const yesterdayStats = userId
    ? await todoRepo.countByUserDateRange(userId, yesterdayStart, yesterdayEnd)
    : await todoRepo.countByDateRange(deviceId, yesterdayStart, yesterdayEnd);

  // 5. Calculate streak (simplified: count consecutive days with records)
  let streak = 0;
  try {
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const ds = d.toISOString().split("T")[0];
      const count = userId
        ? await todoRepo.countByUserDateRange(userId, `${ds}T00:00:00Z`, `${ds}T23:59:59Z`)
        : await todoRepo.countByDateRange(deviceId, `${ds}T00:00:00Z`, `${ds}T23:59:59Z`);
      if (count.total > 0) {
        streak++;
      } else {
        break;
      }
    }
  } catch {
    // non-critical
  }

  // 6. Build AI prompt
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;

  // Format todos with domain/impact annotations
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
      ? `逾期(${overdue.length}): ${overdue.map(formatTodo).join("; ")}`
      : "",
    unscheduled.length > 0
      ? `未排期(${unscheduled.length}): ${unscheduled.map(formatTodo).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Identify AI-actionable items for briefing
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

  const memoryContext =
    memories.length > 0 ? memories.join("\n") : "无近期记忆";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个高效的个人助手，正在为用户生成晨间简报。
${soulContent ? `你的人设：\n${soulContent}\n` : ""}${profileContent ? `用户画像：\n${profileContent}\n` : ""}
请基于以下信息生成简洁、实用的晨间简报。
待办事项带有领域标记[work/life/social/learning/health]和影响力评分。
标记 *AI可协助* 的事项，在 priority_items 中可建议"让AI帮你处理"。
返回 JSON 格式：
{
  "greeting": "个性化问候，包含日期",
  "priority_items": ["今日最重要的3-5件事"],
  "unfinished": ["昨日未完成的事项"],
  "relay_pending": [{"person":"人名","context":"事由","todoId":"id"}],
  "followups": ["从记忆中提取的跟进提醒"],
  "stats": {"yesterday_done": 数字, "yesterday_total": 数字, "streak": 数字}
}
保持简洁务实，每条不超过20字。如果某个类别为空，返回空数组。`,
    },
    {
      role: "user",
      content: `今天: ${dateStr}

## 待办事项
${todosContext || "暂无待办"}

## 待转达
${relayContext}
${aiActionableContext}

## 近期记忆
${memoryContext}
${cognitiveHints.length > 0 ? `\n## 思考变化提醒\n${cognitiveHints.join("\n")}\n将这些变化自然地编入 followups 字段，用温和的语气提醒用户可以回顾。不要使用"矛盾""聚类"等技术术语。` : ""}${cognitiveReportSection}

## 昨日统计
完成: ${yesterdayStats.done}/${yesterdayStats.total}
连续记录: ${streak} 天`,
    },
  ];

  try {
    const response = await chatCompletion(messages, {
      json: true,
      temperature: 0.5,
    });
    const parsed = JSON.parse(response.content) as BriefingResult;

    // Ensure stats are populated even if AI omits them
    if (!parsed.stats) {
      parsed.stats = {
        yesterday_done: yesterdayStats.done,
        yesterday_total: yesterdayStats.total,
        streak,
      };
    }

    // Populate relay todoIds if AI missed them
    if (parsed.relay_pending && relayTodos.length > 0) {
      for (const rp of parsed.relay_pending) {
        if (!rp.todoId) {
          const match = relayTodos.find(
            (t) =>
              t.text.includes(rp.person) || t.text.includes(rp.context),
          );
          if (match) rp.todoId = match.id;
        }
      }
    }

    // Cache the result (non-critical — table may not exist yet)
    try {
      await briefingRepo.upsert(deviceId, today, "morning", parsed);
    } catch (cacheErr: any) {
      console.warn(`[daily-loop] Failed to cache briefing: ${cacheErr.message}`);
    }
    console.log(`[daily-loop] Morning briefing generated for ${deviceId}`);

    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI briefing generation failed: ${err.message}`);

    // Return a fallback briefing from raw data
    const fallback: BriefingResult = {
      greeting: `早上好！今天是${dateStr}`,
      priority_items: todayScheduled.slice(0, 5).map((t) => t.text),
      unfinished: overdue.map((t) => t.text),
      relay_pending: relayTodos.map((t) => ({
        person: (t as any).relay_meta?.target_person || "",
        context: t.text,
        todoId: t.id,
      })),
      followups: [],
      stats: {
        yesterday_done: yesterdayStats.done,
        yesterday_total: yesterdayStats.total,
        streak,
      },
    };

    try { await briefingRepo.upsert(deviceId, today, "morning", fallback); } catch { /* table may not exist */ }
    return fallback;
  }
}

// ── Evening Summary ──

export async function generateEveningSummary(
  deviceId: string,
  userId?: string,
): Promise<SummaryResult> {
  const today = new Date().toISOString().split("T")[0];

  // Check cache — gracefully handle missing table
  try {
    const cached = await briefingRepo.findFresh(deviceId, today, "evening", 2);
    if (cached) {
      console.log(`[daily-loop] Using cached evening summary for ${deviceId}`);
      return cached.content as SummaryResult;
    }
  } catch (err: any) {
    console.warn(`[daily-loop] Evening cache check failed: ${err.message}`);
  }

  // 1. Today's completed todos
  const allTodos = userId
    ? await todoRepo.findByUser(userId)
    : await todoRepo.findByDevice(deviceId);
  const todayDone = allTodos.filter(
    (t) => t.done && t.completed_at && t.completed_at.startsWith(today),
  );

  // 2. Today's new records count
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

  // 3. Still pending items
  const pending = userId
    ? await todoRepo.findPendingByUser(userId)
    : await todoRepo.findPendingByDevice(deviceId);

  // 4. Relay status
  const relayTodos = allTodos.filter(
    (t) => (t as any).category === "relay",
  );
  const relaysCompleted = relayTodos.filter(
    (t) => t.done && t.completed_at && t.completed_at.startsWith(today),
  ).length;
  const relaysPending = relayTodos.filter((t) => !t.done);

  // 5. Load soul + profile
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

  // 5b. Load cognitive report for today's stats
  let eveningCognitiveSection = "";
  try {
    const uid = userId ?? deviceId;
    const report = await generateCognitiveReport(uid);
    if (!report.is_empty) {
      const lines: string[] = [];
      const { today_strikes: ts } = report;
      const total = ts.perceive + ts.judge + ts.realize + ts.intend + ts.feel;
      if (total > 0) {
        lines.push(`今日思考: 感知${ts.perceive}次, 判断${ts.judge}次, 领悟${ts.realize}次, 意图${ts.intend}个, 感受${ts.feel}次`);
      }
      if (report.contradictions.length > 0) {
        lines.push(`想法变化: ${report.contradictions.length}处`);
      }
      if (report.behavior_drift.completion_rate > 0) {
        lines.push(`行动完成率: ${Math.round(report.behavior_drift.completion_rate * 100)}%`);
      }
      if (lines.length > 0) {
        eveningCognitiveSection = `\n## 今日认知统计\n${lines.join("\n")}\n将这些数据自然编入总结，用温暖的口吻。如果有领悟，重点提及。不要使用技术术语。`;
      }
    }
  } catch {
    // non-critical
  }

  // 5c. Load today's cognitive digest from ai-self diary
  let cognitiveDigest = "";
  try {
    const diaryEntry = userId
      ? await aiDiaryRepo.findByUser(userId, "ai-self", today)
      : await aiDiaryRepo.findFull(deviceId, "ai-self", today);
    if (diaryEntry?.full_content) {
      // Extract [认知摘要] lines
      const lines = diaryEntry.full_content
        .split("\n")
        .filter((l) => l.includes("[认知摘要]"))
        .map((l) => l.replace("[认知摘要]", "").trim());
      if (lines.length > 0) {
        cognitiveDigest = lines.join("；");
      }
    }
  } catch {
    // non-critical
  }

  // 6. Generate summary via AI
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是用户的个人助手，正在生成日终总结。
${soulContent ? `你的人设：\n${soulContent}\n` : ""}${profileContent ? `用户画像：\n${profileContent}\n` : ""}
基于今日数据生成简洁总结。
返回 JSON：
{
  "accomplishments": ["今日完成的重要事项"],
  "pending_items": ["仍需处理的事项"],
  "relay_summary": ["转达事项状态"],
  "stats": {"done": 数字, "new_records": 数字, "relays_completed": 数字},
  "tomorrow_seeds": ["明日需要关注的事项提示"]
}
保持简洁，每条不超过20字。`,
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

## 今日新记录数: ${newRecordCount}
${cognitiveDigest ? `\n## 今日思考发现\n${cognitiveDigest}\n将这些发现自然地编入 tomorrow_seeds 或 accomplishments。用"想法演进""新的联系""思路变化"等温和表述，不要使用"聚类""Strike""矛盾检测"等技术术语。` : ""}${eveningCognitiveSection}`,
    },
  ];

  try {
    const response = await chatCompletion(messages, {
      json: true,
      temperature: 0.5,
    });
    const parsed = JSON.parse(response.content) as SummaryResult;

    if (!parsed.stats) {
      parsed.stats = {
        done: todayDone.length,
        new_records: newRecordCount,
        relays_completed: relaysCompleted,
      };
    }

    // Cache (non-critical)
    try { await briefingRepo.upsert(deviceId, today, "evening", parsed); } catch { /* table may not exist */ }

    // Save tomorrow seeds as memory
    if (parsed.tomorrow_seeds && parsed.tomorrow_seeds.length > 0) {
      try {
        const memoryManager = new MemoryManager();
        const seedContent = `明日关注: ${parsed.tomorrow_seeds.join("; ")}`;
        await memoryManager.maybeCreateMemory(deviceId, seedContent, today, userId);
      } catch {
        // non-critical
      }
    }

    console.log(`[daily-loop] Evening summary generated for ${deviceId}`);
    return parsed;
  } catch (err: any) {
    console.error(`[daily-loop] AI summary generation failed: ${err.message}`);

    const fallback: SummaryResult = {
      accomplishments: todayDone.slice(0, 5).map((t) => t.text),
      pending_items: pending.slice(0, 5).map((t) => t.text),
      relay_summary: relaysPending.map((t) => `待转达: ${t.text}`),
      stats: {
        done: todayDone.length,
        new_records: newRecordCount,
        relays_completed: relaysCompleted,
      },
      tomorrow_seeds: [],
    };

    try { await briefingRepo.upsert(deviceId, today, "evening", fallback); } catch { /* table may not exist */ }
    return fallback;
  }
}
