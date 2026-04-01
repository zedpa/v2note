import { loadSkills, mergeWithCustomSkills } from "../skills/loader.js";
import type { Skill } from "../skills/types.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { streamWithTools, chatCompletionStream } from "../ai/provider.js";
import { generateCognitiveReport } from "../cognitive/report.js";
import { MemoryManager } from "../memory/manager.js";
import { updateSoul } from "../soul/manager.js";
import { updateProfile } from "../profile/manager.js";
import { appendToDiary } from "../diary/manager.js";
import { getSession } from "../session/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { pendingIntentRepo } from "../db/repositories/index.js";
import { todoRepo } from "../db/repositories/index.js";
import { createDefaultRegistry } from "../tools/definitions/index.js";
import type { ToolContext } from "../tools/types.js";
import { mayProfileUpdate } from "../lib/text-utils.js";
import { shouldUpdateSoulStrict } from "../cognitive/self-evolution.js";
import { gatherDecisionContext, buildDecisionPrompt } from "../cognitive/decision.js";
import { generateAlerts } from "../cognitive/alerts.js";
import { detectCognitiveQuery, loadChatCognitive, buildGoalDiscussionContext, buildInsightDiscussionContext } from "../cognitive/advisor-context.js";
import type { ModelTier } from "../ai/provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INSIGHTS_DIR = join(__dirname, "../../insights");
const SKILLS_DIR = join(__dirname, "../../skills");

/** Max characters for transcript context injected into prompt */
const MAX_TRANSCRIPT_CHARS = 8000;

/** 全局工具注册表——启动时初始化一次 */
const toolRegistry = createDefaultRegistry();

export interface ChatStartPayload {
  deviceId: string;
  userId?: string;
  mode: "review" | "command" | "insight" | "decision";
  dateRange: { start: string; end: string };
  initialMessage?: string;
  assistantPreamble?: string;
  /** 前端显式指定的 skill（从技能面板或 "/skill" 触发） */
  skill?: string;
  localConfig?: {
    soul?: { content: string };
    skills?: {
      configs: Array<{ name: string; enabled: boolean; description?: string; prompt?: string; builtin?: boolean }>;
      selectedInsightSkill?: string;
      /** @deprecated Use selectedInsightSkill */
      selectedReviewSkill?: string;
    };
  };
}

// ── Skill 自动路由：关键词匹配（零 AI 调用成本） ──

const SKILL_ROUTE_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /帮我复盘|回顾一下|总结这[周月]/, skill: "review-guide" },
  { pattern: /帮我拆解|拆成待办|分解.*任务|拆.*项目|帮我规划/, skill: "todo-management" },
  { pattern: /芒格|决策复盘/, skill: "munger-review" },
  { pattern: /深入想想|二阶思考/, skill: "second-order-thinking" },
  { pattern: /帮我分析一下|元问题/, skill: "meta-question" },
];

/** 需要深度输出（推理模型）的 skill */
const DEEP_SKILLS = new Set([
  "review-guide", "munger-review", "meta-question", "second-order-thinking",
]);

/** 根据消息内容自动匹配 skill */
function autoRouteSkill(text: string): string | null {
  for (const { pattern, skill } of SKILL_ROUTE_PATTERNS) {
    if (pattern.test(text)) return skill;
  }
  return null;
}

/** 按 name 从 insights/ 和 skills/ 加载单个 skill */
function findSkillByName(name: string): Skill | null {
  const insights = loadSkills(INSIGHTS_DIR);
  const found = insights.find(s => s.name === name);
  if (found) return found;

  const skills = loadSkills(SKILLS_DIR);
  return skills.find(s => s.name === name) ?? null;
}

// ── 问候模式：根据时间 + 日记 + 待办生成个性化问候 ──

function getTimeOfDay(hour: number): { label: string; guidance: string } {
  if (hour < 6) return { label: "深夜", guidance: "语气关怀，不强行引导规划或复盘，可以关心用户为什么还没休息" };
  if (hour < 12) return { label: "早上", guidance: "引导用户说出今天计划做什么，如果有未完成待办可以提及" };
  if (hour < 18) return { label: "下午", guidance: "可以关心工作进展，提及今天已完成或未完成的事" };
  return { label: "晚上", guidance: "推测用户可能想复盘或总结今天，引用具体的日记或待办事项" };
}

async function buildGreetingPrompt(
  userId: string | undefined,
  deviceId: string,
  transcriptSummary: string,
): Promise<string> {
  // 加载未完成待办
  let todosText = "";
  try {
    const todos = userId
      ? await todoRepo.findPendingByUser(userId)
      : await todoRepo.findPendingByDevice(deviceId);
    if (todos.length > 0) {
      const lines = todos.slice(0, 8).map((t) => {
        const dueInfo = t.scheduled_start
          ? ` (${new Date(t.scheduled_start).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })})`
          : "";
        return `- ${t.text}${dueInfo}`;
      });
      todosText = `\n未完成待办（${todos.length}项）：\n${lines.join("\n")}`;
      if (todos.length > 8) todosText += `\n...还有${todos.length - 8}项`;
    }
  } catch {
    // non-critical
  }

  const now = new Date();
  const hour = now.getHours();
  const { label, guidance } = getTimeOfDay(hour);
  const timeStr = now.toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", weekday: "long",
    hour: "numeric", minute: "numeric",
  });

  const contextParts: string[] = [];
  if (transcriptSummary) {
    contextParts.push(`最近日记摘要：\n${transcriptSummary.slice(0, 2000)}`);
  }
  if (todosText) {
    contextParts.push(todosText);
  }

  const contextBlock = contextParts.length > 0
    ? `\n\n以下是用户最近的记录，用于生成贴切的问候：\n${contextParts.join("\n\n")}`
    : "\n\n（用户暂无最近的日记和待办记录）";

  return `[系统指令] 用户刚进入对话界面，请生成一段个性化问候。

当前时间：${timeStr}（${label}）
问候策略：${guidance}
${contextBlock}

要求：
- 简短（2-4句话），自然口语化，像朋友打招呼
- 如果有具体日记或待办内容，引用其中1-2个具体事项（不要泛泛而谈）
- 如果没有数据，就简单问候 + 引导用户聊聊或记录点什么
- 禁止使用"好的!"、"当然!"、"这是个好问题"等开头
- 不要自我介绍，用户知道你是谁
- 结尾自然引出一个开放式问题，邀请用户继续对话`;
}

/**
 * Start a review/insight chat session.
 * Loads memory, soul, and skills into the session context.
 * Returns the initial AI greeting.
 */
export async function startChat(
  payload: ChatStartPayload,
): Promise<AsyncGenerator<string, void, undefined>> {
  const session = getSession(payload.deviceId);
  session.mode = "chat";
  session.userId = payload.userId;

  // Load context in parallel using tiered loader (soul + memories)
  const memoryManager = session.memoryManager;
  const loaded = await memoryManager.loadRelevantContext(payload.deviceId, {
    mode: "chat",
    dateRange: payload.dateRange,
    localSoul: payload.localConfig?.soul?.content,
    userId: payload.userId,
  });
  const soul = loaded.soul ? { content: loaded.soul } : undefined;
  const memories = loaded.memories;

  // Load records from the date range for context
  const records = payload.userId
    ? await recordRepo.findByUserAndDateRange(
        payload.userId,
        `${payload.dateRange.start}T00:00:00`,
        `${payload.dateRange.end}T23:59:59`,
      )
    : await recordRepo.findByDeviceAndDateRange(
        payload.deviceId,
        `${payload.dateRange.start}T00:00:00`,
        `${payload.dateRange.end}T23:59:59`,
      );

  // Load transcripts for these records
  let transcriptSummary = "";
  if (records.length > 0) {
    const recordIds = records.map((r) => r.id);
    const transcripts = await transcriptRepo.findByRecordIds(recordIds);

    if (transcripts.length > 0) {
      let joined = "";
      for (const t of transcripts) {
        const record = records.find((r) => r.id === t.record_id);
        const date = record
          ? new Date(record.created_at).toLocaleDateString("zh-CN")
          : "";
        const entry = `[${date}] ${t.text}`;
        if (joined.length + entry.length > MAX_TRANSCRIPT_CHARS) {
          joined += `\n\n...（已截断，共${transcripts.length}条记录）`;
          break;
        }
        joined += (joined ? "\n\n" : "") + entry;
      }
      transcriptSummary = joined;
    }
  }

  // Build skills — 三条路径统一加载：
  // 1. mode=review → 自动加载 review-guide skill
  // 2. mode=insight → 加载 selectedInsightSkill
  // 3. payload.skill → 前端显式指定（技能面板或 "/" 快捷键）
  let activeSkills: Skill[] = [];

  if (payload.skill) {
    // 前端显式指定的 skill（优先级最高）
    const found = findSkillByName(payload.skill);
    if (found) activeSkills = [found];
    console.log(`[chat] Skill loaded (explicit): ${payload.skill} → ${found ? "ok" : "not found"}`);
  } else if (payload.mode === "review") {
    // 复盘模式自动加载 review-guide skill
    const reviewSkill = findSkillByName("review-guide");
    if (reviewSkill) activeSkills = [reviewSkill];
    // 同时加载用户选择的 insight skill（如果有）
    const selectedName = payload.localConfig?.skills?.selectedInsightSkill
      ?? payload.localConfig?.skills?.selectedReviewSkill;
    if (selectedName && selectedName !== "review-guide") {
      const found = findSkillByName(selectedName);
      if (found) activeSkills.push(found);
    }
    console.log(`[chat] Skill loaded (review mode): ${activeSkills.map(s => s.name).join(", ") || "none"}`);
  } else if (payload.mode === "insight") {
    const selectedName = payload.localConfig?.skills?.selectedInsightSkill
      ?? payload.localConfig?.skills?.selectedReviewSkill;
    if (selectedName) {
      const insights = loadSkills(INSIGHTS_DIR);
      const merged = mergeWithCustomSkills(insights, payload.localConfig?.skills?.configs as any);
      const found = merged.find(s => s.name === selectedName);
      if (found) activeSkills = [found];
    }
  }

  // Load pending intents only for review/insight mode (not command mode)
  let pendingIntentContext = "";
  if (payload.mode !== "command") {
    try {
      const pendingIntents = payload.userId
        ? await pendingIntentRepo.findPendingByUser(payload.userId)
        : await pendingIntentRepo.findPendingByDevice(payload.deviceId);
      if (pendingIntents.length > 0) {
        const lines = pendingIntents.slice(0, 5).map((pi) => {
          const date = new Date(pi.created_at).toLocaleDateString("zh-CN");
          return `- [${pi.intent_type}] "${pi.text}"${pi.context ? ` (${pi.context})` : ""} (${date}, id: ${pi.id})`;
        });
        pendingIntentContext = `\n## 待确认意图\n以下是用户近期提到但未确认的愿望/目标，在对话中自然地跟进（不要一开口就问，找合适时机）：\n${lines.join("\n")}\n不要逐条审问用户，自然聊天中确认即可。确认后使用 confirm 工具处理。`;
      }
    } catch (err: any) {
      console.warn(`[chat] Failed to load pending intents: ${err.message}`);
    }
  }

  // Load cognitive context for review/insight modes (enriched with clusters + alerts)
  let cognitiveContext: string | undefined;
  if (payload.mode === "review" || payload.mode === "insight") {
    try {
      const uid = payload.userId ?? payload.deviceId;
      const cognitive = await loadChatCognitive(uid);
      if (cognitive.contextString) {
        cognitiveContext = cognitive.contextString;
      }
    } catch {
      // non-critical — fall back to no cognitive context
    }
  }

  // 构建 system prompt: 基座 + chat agent + skill + soul/profile/memory
  const systemPrompt = buildSystemPrompt({
    skills: activeSkills,
    soul: soul?.content,
    userProfile: loaded.userProfile,
    memory: memories,
    mode: "chat",
    agent: "chat",
    pendingIntentContext,
    cognitiveContext,
  });

  // Set up session context
  session.context.setSystemPrompt(systemPrompt);

  if (payload.mode === "decision") {
    // Decision mode: deep cognitive graph traversal for decision support
    const userId = payload.userId ?? payload.deviceId;
    const question = payload.initialMessage?.trim() || "帮我分析这个问题";
    const decisionCtx = await gatherDecisionContext(question, userId);
    const decisionPrompt = buildDecisionPrompt(decisionCtx);

    // Override system prompt with decision-specific prompt
    session.context.setSystemPrompt(decisionPrompt);
    session.context.addMessage({ role: "user", content: question });
  } else if (payload.mode === "command") {
    const trimmedMsg = payload.initialMessage?.trim() || "";
    const isGreeting = !trimmedMsg || trimmedMsg === "/";

    if (isGreeting) {
      // 问候模式：加载最近日记 + 待办，生成个性化问候
      const greetingPrompt = await buildGreetingPrompt(
        payload.userId,
        payload.deviceId,
        transcriptSummary,
      );
      session.context.addMessage({ role: "user", content: greetingPrompt });
    } else {
      // 正常命令模式
      if (payload.assistantPreamble) {
        session.context.addMessage({ role: "assistant", content: payload.assistantPreamble });
      }
      session.context.addMessage({ role: "user", content: trimmedMsg });
    }
  } else {
    // Review/insight mode: load transcript context then stream initial review
    if (transcriptSummary) {
      session.context.addMessage({
        role: "user",
        content: `以下是 ${payload.dateRange.start} 到 ${payload.dateRange.end} 期间的记录内容：\n\n${transcriptSummary}\n\n请基于这些内容开始复盘对话。`,
      });
    } else {
      session.context.addMessage({
        role: "user",
        content: `请开始 ${payload.dateRange.start} 到 ${payload.dateRange.end} 的复盘。这段时间暂无录音记录。`,
      });
    }
  }

  // Stream initial response
  // Deep skill（review/insight）→ 预取上下文 + 推理模型（无工具）
  const deepSkill = activeSkills.find(s => DEEP_SKILLS.has(s.name));
  if (deepSkill && (payload.mode === "review" || payload.mode === "insight")) {
    const userMsg = transcriptSummary
      ? `以下是 ${payload.dateRange.start} 到 ${payload.dateRange.end} 期间的记录内容：\n\n${transcriptSummary}\n\n请基于这些内容开始。`
      : `请开始 ${payload.dateRange.start} 到 ${payload.dateRange.end} 的分析。这段时间暂无录音记录。`;
    return streamDeepSkill(session, payload.deviceId, deepSkill, userMsg);
  }

  // 其他模式走工具链
  let initialTier: ModelTier | undefined;
  const hasDeepSkill = activeSkills.some(s => DEEP_SKILLS.has(s.name));
  if (payload.mode === "review" || payload.mode === "insight" || payload.mode === "decision" || hasDeepSkill) {
    initialTier = "chat";
  } else if (payload.mode === "command") {
    const trimmed = payload.initialMessage?.trim() || "";
    if (!trimmed || trimmed === "/") initialTier = "agent"; // 问候用快速模型
  }
  return streamWithNativeTools(session, payload.deviceId, initialTier);
}

// ── Deep Skill 上下文预取 + 无工具流式生成 ──────────────────────────

/**
 * 为 deep skill 预取上下文（DB 直查，零 AI 调用）：
 * - 最近 7 天日记摘要
 * - 未完成待办
 * - 认知报告（Strike 极性、矛盾、聚类变化）
 * - 认知上下文（活跃 cluster + 近期矛盾）
 */
async function prefetchDeepSkillContext(
  userId: string | undefined,
  deviceId: string,
): Promise<string> {
  const parts: string[] = [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  // 1. 最近 7 天日记
  try {
    const records = userId
      ? await recordRepo.findByUserAndDateRange(userId, `${weekAgo}T00:00:00`, `${today}T23:59:59`)
      : await recordRepo.findByDeviceAndDateRange(deviceId, `${weekAgo}T00:00:00`, `${today}T23:59:59`);
    if (records.length > 0) {
      const recordIds = records.map(r => r.id);
      const transcripts = await transcriptRepo.findByRecordIds(recordIds);
      if (transcripts.length > 0) {
        let joined = "";
        for (const t of transcripts) {
          const record = records.find(r => r.id === t.record_id);
          const date = record ? new Date(record.created_at).toLocaleDateString("zh-CN") : "";
          const entry = `[${date}] ${t.text}`;
          if (joined.length + entry.length > MAX_TRANSCRIPT_CHARS) {
            joined += `\n...（已截断，共${transcripts.length}条记录）`;
            break;
          }
          joined += (joined ? "\n\n" : "") + entry;
        }
        parts.push(`## 最近 7 天日记\n${joined}`);
      }
    }
  } catch { /* non-critical */ }

  // 2. 未完成待办
  try {
    const todos = userId
      ? await todoRepo.findPendingByUser(userId)
      : await todoRepo.findPendingByDevice(deviceId);
    if (todos.length > 0) {
      const lines = todos.slice(0, 15).map(t => {
        const dueInfo = t.scheduled_start
          ? ` (${new Date(t.scheduled_start).toLocaleDateString("zh-CN")})`
          : "";
        return `- ${t.text}${dueInfo}`;
      });
      parts.push(`## 待办事项（${todos.length}项）\n${lines.join("\n")}`);
    }
  } catch { /* non-critical */ }

  // 3. 认知报告
  try {
    const ownerOpts = userId ? { userId } : { deviceId };
    const report = await generateCognitiveReport(ownerOpts);
    if (!report.is_empty) {
      const lines: string[] = [];
      const ts = report.today_strikes;
      const total = ts.perceive + ts.judge + ts.realize + ts.intend + ts.feel;
      if (total > 0) {
        lines.push(`今日思考: 感知${ts.perceive} 判断${ts.judge} 领悟${ts.realize} 意图${ts.intend} 感受${ts.feel}`);
      }
      if (report.contradictions.length > 0) {
        const cList = report.contradictions.slice(0, 3).map(
          c => `「${c.strikeA_nucleus.slice(0, 30)}」↔「${c.strikeB_nucleus.slice(0, 30)}」`,
        );
        lines.push(`想法变化: ${cList.join("; ")}`);
      }
      if (report.cluster_changes.length > 0) {
        lines.push(`涌现主题: ${report.cluster_changes.map(c => c.name).join(", ")}`);
      }
      if (lines.length > 0) {
        parts.push(`## 认知动态\n${lines.join("\n")}`);
      }
    }
  } catch { /* non-critical */ }

  // 4. 认知上下文（活跃 cluster + 矛盾）
  if (userId) {
    try {
      const cognitive = await loadChatCognitive(userId);
      if (cognitive.contextString) {
        parts.push(cognitive.contextString);
      }
    } catch { /* non-critical */ }
  }

  return parts.length > 0 ? parts.join("\n\n") : "（暂无最近的日记和待办记录）";
}

/**
 * Deep skill 专用流式生成：预取上下文 → 推理模型（无工具）。
 * 不污染 chat session 的工具调用上下文。
 */
async function* streamDeepSkill(
  session: ReturnType<typeof getSession>,
  deviceId: string,
  skill: Skill,
  userMessage: string,
): AsyncGenerator<string, void, undefined> {
  const t0 = Date.now();

  // 1. DB 直查预取上下文
  const context = await prefetchDeepSkillContext(session.userId, deviceId);
  console.log(`[chat] Deep skill context prefetched in ${Date.now() - t0}ms (${context.length} chars)`);

  // 2. 构建独立消息（不污染 session context）
  const systemPrompt = session.context.getMessages().find(m => m.role === "system")?.content ?? "";
  const messages = [
    { role: "system" as const, content: `${systemPrompt}\n\n${skill.prompt}` },
    { role: "user" as const, content: `${userMessage}\n\n---\n\n以下是你可以参考的用户数据：\n\n${context}` },
  ];

  // 3. 推理模型流式生成（无工具，纯思考）
  let fullResponse = "";
  const stream = chatCompletionStream(messages, { tier: "chat", temperature: 0.7 });
  for await (const chunk of stream) {
    fullResponse += chunk;
    yield chunk;
  }

  // 4. 记录回复到 session context（保持对话连续性）
  if (userMessage) {
    session.context.addMessage({ role: "user", content: userMessage });
  }
  if (fullResponse) {
    session.context.addMessage({ role: "assistant", content: fullResponse });
  }
  console.log(`[chat] Deep skill completed in ${Date.now() - t0}ms (${fullResponse.length} chars)`);
}

/**
 * Send a message in an ongoing chat session.
 */
export async function sendChatMessage(
  deviceId: string,
  text: string,
): Promise<AsyncGenerator<string, void, undefined>> {
  const session = getSession(deviceId);
  if (session.mode !== "chat") {
    throw new Error("No active chat session");
  }

  // Skill 显式激活："/skill:xxx" 格式（从 chat 输入框 "/" 快捷键触发）
  const skillMatch = text.match(/^\/skill:(\S+)$/);
  if (skillMatch) {
    const explicitSkill = findSkillByName(skillMatch[1]);
    if (explicitSkill) {
      console.log(`[chat] Skill activated (explicit): ${explicitSkill.name}`);
      if (DEEP_SKILLS.has(explicitSkill.name)) {
        // Deep skill: 预取上下文 → 推理模型（无工具）
        return streamDeepSkill(session, deviceId, explicitSkill, "请根据以上技能指导开始。");
      }
      // 普通 skill: 走工具链
      session.context.addMessage({
        role: "user",
        content: `[系统：已激活「${explicitSkill.name}」技能]\n\n${explicitSkill.prompt}\n\n---\n\n请根据以上技能指导开始。`,
      });
      return streamWithNativeTools(session, deviceId);
    }
  }

  // Skill 自动路由：关键词匹配
  const matchedSkillName = autoRouteSkill(text);
  if (matchedSkillName) {
    const skill = findSkillByName(matchedSkillName);
    if (skill) {
      console.log(`[chat] Skill auto-routed: ${matchedSkillName} (deep: ${DEEP_SKILLS.has(matchedSkillName)})`);
      if (DEEP_SKILLS.has(matchedSkillName)) {
        // Deep skill: 预取上下文 → 推理模型（无工具）
        return streamDeepSkill(session, deviceId, skill, text);
      }
      // 普通 skill: 走工具链
      session.context.addMessage({
        role: "user",
        content: `[系统：已激活「${skill.name}」技能]\n\n${skill.prompt}\n\n---\n\n${text}`,
      });
      return streamWithNativeTools(session, deviceId);
    }
  }

  // 检测认知相关提问，动态注入认知数据
  if (detectCognitiveQuery(text) && session.userId) {
    try {
      const cognitive = await loadChatCognitive(session.userId);
      if (cognitive.contextString) {
        session.context.addMessage({
          role: "user",
          content: `[系统补充上下文]\n${cognitive.contextString}\n\n${text}`,
        });
        return streamWithNativeTools(session, deviceId);
      }
    } catch {
      // non-critical
    }
  }

  session.context.addMessage({ role: "user", content: text });
  return streamWithNativeTools(session, deviceId);
}

// ── 聊天复杂度分类（关键词快筛，无 AI 调用） ────────────────────────

/** 需要深度推理的关键词/模式 */
const COMPLEX_PATTERNS = [
  /为什么/, /怎么看/, /如何.*(?:分析|理解|评估|规划|决策|解决)/,
  /帮我.*(?:分析|梳理|对比|规划|复盘|总结|拆解|评估)/,
  /(?:优缺点|利弊|权衡|取舍)/,
  /(?:建议|方案|策略|思路).*(?:给|提|想|出)/,
  /(?:深入|详细|系统).*(?:分析|思考|讨论|了解)/,
  /(?:矛盾|冲突|困惑|纠结|犹豫)/,
  /(?:长期|短期|阶段).*(?:目标|计划|路径)/,
  /(?:反思|复盘|回顾).*(?:做得|哪里|问题)/,
];

/** 明确简单的模式（工具调用、简短指令） */
const SIMPLE_PATTERNS = [
  /^(?:帮我|请)?(?:创建|新建|添加|记录|搜索|查找|删除|更新|修改|标记|完成)/,
  /^(?:好的|嗯|知道了|谢谢|明白|ok|收到)/i,
  /^(?:查一下|搜一下|找一下|看看)/,
];

/**
 * 判断用户消息是否需要推理模型。
 * 返回 "chat"（qwen3.5-plus 推理）或 "agent"（MiniMax 工具调用/简单对话）。
 */
function classifyChatTier(text: string): ModelTier {
  const trimmed = text.trim();

  // 短消息（<30字）且匹配简单模式 → agent
  if (trimmed.length < 30) {
    if (SIMPLE_PATTERNS.some(p => p.test(trimmed))) return "agent";
  }

  // 匹配复杂模式 → chat（推理）
  if (COMPLEX_PATTERNS.some(p => p.test(trimmed))) return "chat";

  // 长消息（>200字）可能是复杂问题 → chat
  if (trimmed.length > 200) return "chat";

  // 默认：agent（大多数日常对话不需要推理）
  return "agent";
}

/**
 * Stream response using Vercel AI SDK native function calling.
 *
 * 根据用户消息复杂度自动选择模型层级：
 * - 简单指令/工具调用 → fast（无推理，低延迟）
 * - 分析/决策/复盘 → chat（推理，高质量）
 */
async function* streamWithNativeTools(
  session: ReturnType<typeof getSession>,
  deviceId: string,
  tierOverride?: ModelTier,
): AsyncGenerator<string, void, undefined> {
  // 构建工具执行上下文
  const toolCtx: ToolContext = {
    deviceId,
    userId: session.userId,
    sessionId: session.id,
  };

  // 将注册表导出为 AI SDK tools 格式（绑定执行上下文）
  const aiTools = toolRegistry.toAISDKTools(toolCtx);

  // 自动选择模型层级
  const messages = session.context.getMessages();
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const tier = tierOverride ?? (lastUserMsg ? classifyChatTier(lastUserMsg.content) : "fast");

  if (tier !== "chat") {
    console.log(`[chat] Using ${tier} tier for: "${lastUserMsg?.content.slice(0, 50)}..."`);
  }

  const stream = streamWithTools(
    messages,
    aiTools,
    { temperature: 0.7, maxSteps: 5, tier },
  );

  let fullResponse = "";
  for await (const chunk of stream) {
    fullResponse += chunk;
    yield chunk;
  }

  // 记录完整回复到 session context
  if (fullResponse) {
    session.context.addMessage({ role: "assistant", content: fullResponse });
  }
}

/**
 * End a chat session. Summarize the conversation and update memory/soul.
 */
export async function endChat(deviceId: string): Promise<void> {
  const session = getSession(deviceId);
  if (session.mode !== "chat") return;

  const history = session.context.getHistory();
  if (history.length > 0) {
    const summary = history
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    // Only check user messages for keyword pre-filtering
    const userText = history
      .filter(m => m.role === "user")
      .map(m => m.content)
      .join(" ");

    const userId = session.userId;
    if (!userId) {
      console.warn(`[chat] endChat: session.userId is undefined for device ${deviceId}, soul/profile updates will use deviceId only`);
    }
    if (shouldUpdateSoulStrict(history.filter(m => m.role === "user").map(m => m.content))) {
      updateSoul(deviceId, `[复盘对话] ${summary}`, userId).catch((e) => {
        console.warn(`[chat] Soul update failed: ${e.message}`);
      });
    }
    if (mayProfileUpdate(userText)) {
      updateProfile(deviceId, `[复盘对话] ${summary}`, userId).catch((e) => {
        console.warn(`[chat] Profile update failed: ${e.message}`);
      });
    }
    appendToDiary(deviceId, "ai-self", `[对话摘要] ${summary.slice(0, 500)}`, userId).catch((e) => {
      console.warn(`[chat] Diary append failed: ${e.message}`);
    });

  }

  session.mode = "idle";
  session.context.clear();
}

/** 导出 toolRegistry 供 MCP server 等外部模块使用 */
export { toolRegistry };
