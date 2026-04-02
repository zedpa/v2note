/**
 * Unified Report Handler — 统一日报系统
 * 合并晨间简报和晚间回顾，支持 auto 时段路由。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, recordRepo, goalRepo } from "../db/repositories/index.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
import { generateCognitiveReport } from "../cognitive/retrieval.js";
import { toDateString } from "./daily-loop.js";

// ── Prompt 模板加载 ──

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "../prompts");

function loadPromptTemplate(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), "utf-8");
}

// ── Mode 路由 ──

export type ReportMode = "morning" | "evening" | "weekly" | "monthly";

export function resolveMode(hour: number): "morning" | "evening" {
  return hour >= 6 && hour < 14 ? "morning" : "evening";
}

// ── 视角轮换 ──

export interface Perspective {
  name: string;
  instruction: string;
}

const PERSPECTIVES: Record<string, Perspective> = {
  accomplishment: {
    name: "成就感",
    instruction: `今天从"完成了什么"的角度来看。优先列出用户自己可能没意识到"这也算完成了"的小事。语气是替他数清楚、肯定清楚——不夸张，就是如实说。如果什么都没完成，也不回避，"今天就这样了"是真诚的答案。`,
  },
  rhythm: {
    name: "节奏感",
    instruction: `今天从"精力和节奏"的角度来看。不只看做了什么，而是看：今天的状态怎么样？是顺还是卡？如果有日记记录，从中找精力变化的线索。不评判节奏好不好，只是让他看见今天的自己是什么状态。语气：观察者，不是教练。`,
  },
  growth: {
    name: "成长线",
    instruction: `今天从"认知变化"的角度来看。优先挖 cognitive_highlights——用户今天说了什么、想到了什么新的东西。如果有认知发现，这个视角下应当把它放到最显眼的位置。如果没有日记记录，也不强行挖。语气：好奇，轻描淡写地发现，不要拔高成"重大洞见"。`,
  },
  connection: {
    name: "连接感",
    instruction: `今天从"与人的连接"的角度来看。关注日记记录中提到的人、协作、沟通、转达事项。如果今天完全没有涉及他人的事，直接说"今天是安静的一天，都是自己的事"。语气：温和，不强行寻找人际意义。`,
  },
};

// dayOfWeek: 0=周日 ... 6=周六
const DAY_TO_PERSPECTIVE: string[] = [
  "growth",        // 0 周日
  "accomplishment", // 1 周一
  "rhythm",        // 2 周二
  "growth",        // 3 周三
  "connection",    // 4 周四
  "accomplishment", // 5 周五
  "rhythm",        // 6 周六
];

export function getPerspective(dayOfWeek: number): Perspective {
  const key = DAY_TO_PERSPECTIVE[dayOfWeek] ?? "accomplishment";
  return PERSPECTIVES[key];
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

// ── 格式化工具 ──

function formatTodo(t: any): string {
  const domain = t.domain ? `[${t.domain}]` : "";
  return `${domain} ${t.text}`.trim();
}

// ── Morning Report ──

export async function generateMorningReport(
  deviceId: string,
  userId?: string,
): Promise<any> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  // 并行加载数据
  const [soul, profile, pendingTodos, activeGoals, yesterdayStats, streak] = await Promise.all([
    loadSoul(deviceId, userId).catch(() => null),
    loadProfile(deviceId, userId).catch(() => null),
    (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)).catch(() => []),
    (userId ? goalRepo.findActiveByUser(userId) : goalRepo.findActiveByDevice(deviceId)).catch(() => []),
    (userId
      ? todoRepo.countByUserDateRange(userId, `${yesterday}T00:00:00Z`, `${yesterday}T23:59:59Z`)
      : todoRepo.countByDateRange(deviceId, `${yesterday}T00:00:00Z`, `${yesterday}T23:59:59Z`)
    ).catch(() => ({ done: 0, total: 0 })),
    todoRepo.getStreak({ userId: userId ?? undefined, deviceId }).catch(() => 0),
  ]);

  // 组装上下文
  const todayScheduled = pendingTodos.filter((t) =>
    toDateString(t.scheduled_start)?.startsWith(today),
  );
  const overdue = pendingTodos.filter((t) =>
    t.scheduled_end ? new Date(t.scheduled_end) < now : false,
  );

  const pendingText = pendingTodos.length > 0
    ? pendingTodos.slice(0, 10).map((t) => `- [P${t.priority ?? 3}] ${formatTodo(t)}`).join("\n")
    : "暂无待办";

  const goalsText = activeGoals.length > 0
    ? activeGoals.slice(0, 5).map((g: any) => `- ${g.title} (${g.status})`).join("\n")
    : "暂无活跃目标";

  const statsText = `done: ${yesterdayStats.done}, total: ${yesterdayStats.total}, streak: ${streak}`;

  // 加载并渲染 prompt
  const template = loadPromptTemplate("morning");
  const systemPrompt = template
    .replace("{soulContent}", soul?.content ?? "")
    .replace("{profileContent}", profile?.content ?? "")
    .replace("{pendingTodos}", pendingText)
    .replace("{activeGoals}", goalsText)
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

    // 确保 stats
    if (!parsed.stats) {
      parsed.stats = { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total, streak };
    }

    return parsed;
  } catch (err: any) {
    console.error(`[report] Morning generation failed: ${err.message}`);
    return {
      mode: "morning",
      generated_at: new Date().toISOString(),
      headline: `今天有${todayScheduled.length}件事排着`,
      today_focus: todayScheduled.slice(0, 5).map((t) => t.text),
      goal_progress: [],
      carry_over: overdue.map((t) => t.text),
      ai_suggestions: [],
      comparison: "",
      stats: { yesterday_done: yesterdayStats.done, yesterday_total: yesterdayStats.total, streak },
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

  // 并行加载数据
  const [soul, profile, allTodos, pendingTodos, activeGoals, streak] = await Promise.all([
    loadSoul(deviceId, userId).catch(() => null),
    loadProfile(deviceId, userId).catch(() => null),
    (userId ? todoRepo.findByUser(userId) : todoRepo.findByDevice(deviceId)).catch(() => []),
    (userId ? todoRepo.findPendingByUser(userId) : todoRepo.findPendingByDevice(deviceId)).catch(() => []),
    (userId ? goalRepo.findActiveByUser(userId) : goalRepo.findActiveByDevice(deviceId)).catch(() => []),
    todoRepo.getStreak({ userId: userId ?? undefined, deviceId }).catch(() => 0),
  ]);

  const todayDone = allTodos.filter(
    (t) => t.done && t.completed_at && toDateString(t.completed_at)?.startsWith(today),
  );

  // 今日原始记录（关键：给 AI 引用素材）
  let todayRecords: any[] = [];
  let newRecordCount = 0;
  try {
    const records = userId
      ? await recordRepo.findByUser(userId, { limit: 100 })
      : await recordRepo.findByDevice(deviceId, { limit: 100 });
    const todayOnly = records.filter(
      (r: any) => r.created_at && toDateString(r.created_at)?.startsWith(today),
    );
    newRecordCount = todayOnly.length;
    todayRecords = todayOnly.slice(0, 5).map((r: any) => ({
      summary: r.short_summary || "",
      transcript: (r.transcript || "").slice(0, 200),
      created_at: r.created_at,
    }));
  } catch { /* non-critical */ }

  // 视角
  const perspective = getPerspective(now.getDay());

  // 组装上下文
  const doneText = todayDone.length > 0
    ? todayDone.map((t) => `- ${t.text}`).join("\n")
    : "今日无完成事项";

  const recordsText = todayRecords.length > 0
    ? todayRecords.map((r, i) => `[${i + 1}] ${r.summary || r.transcript}`).join("\n")
    : "今日无记录";

  const pendingText = pendingTodos.slice(0, 5).map((t) => `- [P${t.priority ?? 3}] ${t.text}`).join("\n") || "无";

  const goalsText = activeGoals.slice(0, 5).map((g: any) => `- ${g.title} (${g.status})`).join("\n") || "无";

  // 加载并渲染 prompt
  const template = loadPromptTemplate("evening");
  const systemPrompt = template
    .replace("{soulContent}", soul?.content ?? "")
    .replace("{profileContent}", profile?.content ?? "")
    .replace("{perspectiveName}", perspective.name)
    .replace("{perspectiveInstruction}", perspective.instruction)
    .replace("{todayDone}", doneText)
    .replace("{todayRecords}", recordsText)
    .replace("{todayPending}", pendingText)
    .replace("{activeGoals}", goalsText);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `今天: ${today}，视角: ${perspective.name}，请生成晚间回顾。` },
  ];

  try {
    const response = await chatCompletion(messages, { json: true, temperature: 0.5, tier: "report" });
    const parsed = safeParseJson<any>(response.content);
    if (!parsed) throw new Error("AI 返回格式异常");

    parsed.mode = "evening";
    parsed.generated_at = new Date().toISOString();

    if (!parsed.stats) {
      parsed.stats = { done: todayDone.length, new_records: newRecordCount, streak };
    }

    return parsed;
  } catch (err: any) {
    console.error(`[report] Evening generation failed: ${err.message}`);
    return {
      mode: "evening",
      generated_at: new Date().toISOString(),
      headline: todayDone.length > 0 ? `今天完成了${todayDone.length}件事` : "安静的一天",
      accomplishments: todayDone.slice(0, 5).map((t) => t.text),
      cognitive_highlights: [],
      goal_updates: [],
      attention_needed: [],
      comparison: "",
      tomorrow_preview: pendingTodos.slice(0, 3).map((t) => t.text),
      stats: { done: todayDone.length, new_records: newRecordCount, streak },
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
