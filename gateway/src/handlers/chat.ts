import { loadSkills, mergeWithCustomSkills } from "../skills/loader.js";
import type { Skill } from "../skills/types.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { streamWithTools, chatCompletionStream } from "../ai/provider.js";
import { compressMessages } from "./chat-compression.js";
// generateCognitiveReport 已不再使用（认知动态改从 wiki_page 加载）
import { MemoryManager } from "../memory/manager.js";
// updateSoul / updateProfile 已改为 AI 通过工具自主调用，不再在 endChat 中硬编码
// appendToDiary 由 daily-loop 的 generateChatDiary 批量生成
import { getSession } from "../session/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { pendingIntentRepo } from "../db/repositories/index.js";
import { todoRepo } from "../db/repositories/index.js";
import { chatMessageRepo } from "../db/repositories/index.js";
import { createDefaultRegistry } from "../tools/definitions/index.js";
import type { ToolContext } from "../tools/types.js";
// mayProfileUpdate 已改为 AI 工具自主调用
import { buildDateAnchor, fmt, formatDateWithRelative } from "../lib/date-anchor.js";
import { today, daysAgo, now as tzNow, toLocalDateTime } from "../lib/tz.js";
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
  deviceId: string; // 已弃用，保留兼容，内部使用 userId
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

/** 检查 skill 是否在 UserAgent 技能配置中已开启 */
async function isSkillEnabledInUserAgent(userId: string | undefined, skillName: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const { userAgentRepo } = await import("../db/repositories/index.js");
    const ua = await userAgentRepo.findByUser(userId);
    if (!ua) return false;
    // 在技能配置段落中查找 skillName 所在行，检查是否包含"开启/启用/on/enable"
    const lines = ua.content.split("\n");
    for (const line of lines) {
      if (line.includes(skillName)) {
        const lower = line.toLowerCase();
        if (lower.includes("开启") || lower.includes("启用") || lower.includes("enable") || lower.includes(" on")) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
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
  userId: string,
  transcriptSummary: string,
): Promise<string> {
  // 加载未完成待办
  let todosText = "";
  try {
    const todos = await todoRepo.findPendingByUser(userId);
    if (todos.length > 0) {
      const lines = todos.slice(0, 8).map((t) => {
        const dueInfo = t.scheduled_start
          ? ` (${toLocalDateTime(t.scheduled_start)})`
          : "";
        return `- ${t.text}${dueInfo}`;
      });
      todosText = `\n未完成待办（${todos.length}项）：\n${lines.join("\n")}`;
      if (todos.length > 8) todosText += `\n...还有${todos.length - 8}项`;
    }
  } catch {
    // non-critical
  }

  const now = tzNow();
  const hour = now.getHours();
  const { label, guidance } = getTimeOfDay(hour);
  const timeStr = toLocalDateTime(now);

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
 * Initialize a chat session: load context, build system prompt, restore history.
 * Does NOT generate any AI response — all messages go through handleChatMessage.
 */
export async function initChat(
  payload: ChatStartPayload,
): Promise<void> {
  const userId = payload.userId ?? payload.deviceId;
  const session = getSession(userId);
  session.mode = "chat";

  // Load context in parallel using tiered loader (soul + memories)
  const memoryManager = session.memoryManager;
  const loaded = await memoryManager.loadRelevantContext(userId, {
    mode: "chat",
    dateRange: payload.dateRange,
    localSoul: payload.localConfig?.soul?.content,
    userId,
  });
  const memories = loaded.memories;

  // Load records from the date range for context
  const records = await recordRepo.findByUserAndDateRange(
    userId,
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
          ? formatDateWithRelative(new Date(record.created_at))
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
      const pendingIntents = await pendingIntentRepo.findPendingByUser(userId);
      if (pendingIntents.length > 0) {
        const lines = pendingIntents.slice(0, 5).map((pi) => {
          const date = formatDateWithRelative(new Date(pi.created_at));
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
      const cognitive = await loadChatCognitive(userId);
      if (cognitive.contextString) {
        cognitiveContext = cognitive.contextString;
      }
    } catch {
      // non-critical — fall back to no cognitive context
    }
  }

  // 构建 system prompt: SharedAgent + Soul + UserAgent + Profile + 数据摘要提示
  // Memory/Wiki 不再注入完整内容，改为数量提示，逼 AI 通过工具查询最新数据
  const memoryHint = memories.length > 0
    ? [`（有 ${memories.length} 条相关记忆，涉及用户历史时请用 search 工具查询最新数据）`]
    : [];
  const wikiHint = loaded.wikiContext && loaded.wikiContext.length > 0
    ? [`（有 ${loaded.wikiContext.length} 个相关知识主题，涉及具体内容时请用 search 工具查询）`]
    : [];
  const systemPrompt = buildSystemPrompt({
    skills: activeSkills,
    soul: loaded.soul,
    userAgent: loaded.userAgent,
    userProfile: loaded.userProfile,
    memory: memoryHint,
    wikiContext: wikiHint,
    mode: "chat",
    // chat 不再传 agent（Soul 已替代 chat.md），briefing/onboarding 保留
    pendingIntentContext,
    cognitiveContext,
  });

  // Set up session context
  session.context.setSystemPrompt(systemPrompt);

  // 保存初始化参数，压缩时用于重建 system prompt
  session.chatInitOpts = {
    activeSkills: activeSkills.map(s => ({ name: s.name, prompt: s.prompt })),
    dateRange: payload.dateRange,
  };

  // ── 上下文恢复：从 DB 加载历史摘要 + 最近消息（command 模式） ──
  if (payload.mode === "command" && userId) {
    try {
      // 1. 加载所有 context-summary（压缩摘要）
      const summaries = await chatMessageRepo.getContextSummaries(userId);
      if (summaries.length > 0) {
        const summaryText = summaries.map(s => s.content).join("\n\n");
        session.context.addMessage({
          role: "system",
          content: `[历史对话摘要]\n${summaryText}`,
        });
      }
      // 2. 加载最近 20 条未压缩消息（按时间正序注入，跨天插入日期分隔）
      const recentMessages = await chatMessageRepo.getUncompressedMessages(userId, 20);
      const nowDate = tzNow();
      let lastDateStr = "";
      for (const msg of recentMessages.reverse()) {
        if (msg.role === "user" || msg.role === "assistant") {
          // 检测日期切换，插入分隔标记
          const msgDate = new Date(msg.created_at);
          const msgDateStr = fmt(msgDate);
          if (msgDateStr !== lastDateStr) {
            const label = formatDateWithRelative(msgDate, nowDate);
            session.context.addMessage({
              role: "system",
              content: `[以下是 ${label} 的对话]`,
            });
            lastDateStr = msgDateStr;
          }
          session.context.addMessage({ role: msg.role, content: msg.content });
        }
      }
      console.log(`[chat] Context restored: ${summaries.length} summaries + ${recentMessages.length} recent messages`);
    } catch (err: any) {
      console.warn(`[chat] Context restore failed: ${err.message}`);
    }
  }

  // Session 初始化完成，等待 chat.message
}

/**
 * 重建 system prompt：用最新的 soul/memory/wiki/profile 重新组装。
 * 在压缩后调用，确保长会话中 system prompt 不过期。
 */
export async function rebuildSystemPrompt(userId: string): Promise<void> {
  const session = getSession(userId);
  if (session.mode !== "chat" || !session.chatInitOpts) return;

  try {
    const loaded = await session.memoryManager.loadRelevantContext(userId, {
      mode: "chat",
      dateRange: session.chatInitOpts.dateRange,
      userId,
    });

    // 认知上下文
    let cognitiveContext: string | undefined;
    try {
      const cognitive = await loadChatCognitive(userId);
      if (cognitive.contextString) cognitiveContext = cognitive.contextString;
    } catch { /* non-critical */ }

    const memoryHint = loaded.memories.length > 0
      ? [`（有 ${loaded.memories.length} 条相关记忆，涉及用户历史时请用 search 工具查询最新数据）`]
      : [];
    const wikiHint = loaded.wikiContext && loaded.wikiContext.length > 0
      ? [`（有 ${loaded.wikiContext.length} 个相关知识主题，涉及具体内容时请用 search 工具查询）`]
      : [];
    const newPrompt = buildSystemPrompt({
      skills: session.chatInitOpts.activeSkills as Skill[],
      soul: loaded.soul,
      userAgent: loaded.userAgent,
      userProfile: loaded.userProfile,
      memory: memoryHint,
      wikiContext: wikiHint,
      mode: "chat",
      cognitiveContext,
    });

    session.context.setSystemPrompt(newPrompt);
    console.log(`[chat] System prompt rebuilt for user ${userId} (${newPrompt.length} chars)`);
  } catch (err: any) {
    console.warn(`[chat] Failed to rebuild system prompt: ${err.message}`);
  }
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
  userId: string,
): Promise<string> {
  const parts: string[] = [];
  const weekAgo = daysAgo(7);
  const todayStr = today();

  // 1. 最近 7 天日记
  try {
    const records = await recordRepo.findByUserAndDateRange(userId, `${weekAgo}T00:00:00`, `${todayStr}T23:59:59`);
    if (records.length > 0) {
      const recordIds = records.map(r => r.id);
      const transcripts = await transcriptRepo.findByRecordIds(recordIds);
      if (transcripts.length > 0) {
        let joined = "";
        for (const t of transcripts) {
          const record = records.find(r => r.id === t.record_id);
          const date = record ? formatDateWithRelative(new Date(record.created_at)) : "";
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
    const todos = await todoRepo.findPendingByUser(userId);
    if (todos.length > 0) {
      const lines = todos.slice(0, 15).map(t => {
        const dueInfo = t.scheduled_start
          ? ` (${fmt(new Date(t.scheduled_start))})`
          : "";
        return `- ${t.text}${dueInfo}`;
      });
      parts.push(`## 待办事项（${todos.length}项）\n${lines.join("\n")}`);
    }
  } catch { /* non-critical */ }

  // 3. 认知动态（从 wiki_page 加载，替代 strike 极性统计）
  if (userId) {
    try {
      const { query: dbQuery } = await import("../db/pool.js");
      const recentPages = await dbQuery<{ title: string; summary: string | null }>(
        `SELECT title, summary FROM wiki_page
         WHERE user_id = $1 AND status = 'active'
         ORDER BY COALESCE(compiled_at, updated_at) DESC
         LIMIT 5`,
        [userId],
      );
      if (recentPages.length > 0) {
        const lines = recentPages.map(p => `- ${p.title}${p.summary ? `：${p.summary.slice(0, 50)}` : ""}`);
        parts.push(`## 认知动态\n近期关注主题：\n${lines.join("\n")}`);
      }
    } catch { /* non-critical */ }
  }

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
  userId: string,
  skill: Skill,
  userMessage: string,
): AsyncGenerator<string, void, undefined> {
  const t0 = Date.now();

  // 1. DB 直查预取上下文
  const context = await prefetchDeepSkillContext(userId);
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
/** 跨天检测：如果 system prompt 中的日期锚点过期，替换为最新的 */
function refreshDateAnchorIfNeeded(session: ReturnType<typeof getSession>) {
  const currentDate = today();
  const messages = session.context.getMessages();
  const sysMsg = messages.find(m => m.role === "system");
  if (!sysMsg) return;
  // 检测 system prompt 中嵌入的日期锚点是否还是今天
  const match = sysMsg.content.match(/当前：(\d{4}-\d{2}-\d{2})/);
  if (match && match[1] !== currentDate) {
    console.log(`[chat] Date anchor stale (${match[1]} → ${currentDate}), refreshing`);
    const newAnchor = buildDateAnchor();
    const updated = sysMsg.content.replace(
      /## 时间锚点（直接查表，禁止自行计算）[\s\S]*?(?=\n## |\n# |$)/,
      newAnchor,
    );
    session.context.setSystemPrompt(updated);
  }
}

export async function sendChatMessage(
  userId: string,
  text: string,
): Promise<AsyncGenerator<string, void, undefined>> {
  const session = getSession(userId);
  if (session.mode !== "chat") {
    throw new Error("No active chat session");
  }

  // 跨天检测：刷新日期锚点
  refreshDateAnchorIfNeeded(session);

  // /compact 指令：手动触发上下文压缩
  if (text.trim() === "/compact") {
    return (async function* () {
      if (!session.userId) {
        yield "需要登录后才能执行压缩。";
        return;
      }
      yield "正在压缩对话上下文…\n";
      try {
        await compressMessages(session.userId);
        // 压缩后重建 system prompt（加载最新 soul/memory/wiki）+ 恢复消息
        await rebuildSystemPrompt(session.userId);
        const summaries = await chatMessageRepo.getContextSummaries(session.userId);
        const recentMessages = await chatMessageRepo.getUncompressedMessages(session.userId, 20);
        // 清空旧消息，保留刚刷新的 system prompt
        const freshPrompt = session.context.getMessages().find(m => m.role === "system")?.content;
        session.context.clear();
        if (freshPrompt) session.context.setSystemPrompt(freshPrompt);
        // 注入压缩摘要
        if (summaries.length > 0) {
          session.context.addMessage({
            role: "system",
            content: `[历史对话摘要]\n${summaries.map(s => s.content).join("\n\n")}`,
          });
        }
        // 注入最近消息
        for (const msg of recentMessages.reverse()) {
          if (msg.role === "user" || msg.role === "assistant") {
            session.context.addMessage({ role: msg.role, content: msg.content });
          }
        }
        yield `✅ 压缩完成。保留 ${summaries.length} 条摘要 + ${recentMessages.length} 条最近消息，系统上下文已刷新。`;
      } catch (err: any) {
        yield `压缩失败: ${err.message}`;
      }
    })();
  }

  // Skill 显式激活："/skill:xxx" 或 "/skill:xxx 用户文本" 格式
  const skillMatch = text.match(/^\/skill:(\S+)(?:\s+(.+))?$/s);
  if (skillMatch) {
    const explicitSkill = findSkillByName(skillMatch[1]);
    if (explicitSkill) {
      const userText = skillMatch[2]?.trim() || "";
      const userPrompt = userText || "请根据以上技能指导开始。";
      console.log(`[chat] Skill activated (explicit): ${explicitSkill.name}${userText ? ` with text: ${userText.slice(0, 50)}` : ""}`);
      if (DEEP_SKILLS.has(explicitSkill.name)) {
        return streamDeepSkill(session, userId, explicitSkill, userPrompt);
      }
      session.context.addMessage({
        role: "user",
        content: `[系统：已激活「${explicitSkill.name}」技能]\n\n${explicitSkill.prompt}\n\n---\n\n${userPrompt}`,
      });
      return streamWithNativeTools(session, userId);
    }
  }

  // Skill 自动路由：关键词匹配（仅 UserAgent 技能配置中已开启的 skill 才激活）
  const matchedSkillName = autoRouteSkill(text);
  if (matchedSkillName) {
    const isEnabled = await isSkillEnabledInUserAgent(session.userId, matchedSkillName);
    if (isEnabled) {
      const skill = findSkillByName(matchedSkillName);
      if (skill) {
        console.log(`[chat] Skill auto-routed: ${matchedSkillName} (deep: ${DEEP_SKILLS.has(matchedSkillName)})`);
        if (DEEP_SKILLS.has(matchedSkillName)) {
          return streamDeepSkill(session, userId, skill, text);
        }
        session.context.addMessage({
          role: "user",
          content: `[系统：已激活「${skill.name}」技能]\n\n${skill.prompt}\n\n---\n\n${text}`,
        });
        return streamWithNativeTools(session, userId);
      }
    } else {
      console.log(`[chat] Skill ${matchedSkillName} matched but not enabled in UserAgent`);
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
        return streamWithNativeTools(session, userId);
      }
    } catch {
      // non-critical
    }
  }

  session.context.addMessage({ role: "user", content: text });
  return streamWithNativeTools(session, userId);
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

/** 数据查询模式 — 必须调工具，禁止从上下文复读 */
const DATA_QUERY_PATTERNS = [
  /(?:几条|多少条|有没有).*(?:日记|记录|待办|笔记)/,
  /(?:日记|记录|待办|笔记).*(?:几条|多少|有没有|有哪些)/,
  /(?:今天|昨天|这周|本周|本月).*(?:日记|记录|待办)/,
  /(?:查|搜|找|看看).*(?:日记|记录|待办|目标)/,
  /(?:日记|记录|待办|目标).*(?:列表|清单|汇总)/,
];

function isDataQuery(text: string): boolean {
  return DATA_QUERY_PATTERNS.some(p => p.test(text));
}

/** 时间查询模式 — 强制调用 get_current_time */
const TIME_QUERY_PATTERNS = [
  /现在几点/, /(?:今天|现在).*(?:星期|周)几/, /今天.*(?:几号|日期|什么日子)/,
  /(?:当前|目前|现在).*时间/, /几点了/,
];

function isTimeQuery(text: string): boolean {
  return TIME_QUERY_PATTERNS.some(p => p.test(text));
}

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
  userId: string,
  tierOverride?: ModelTier,
): AsyncGenerator<string, void, undefined> {
  // 构建工具执行上下文
  const toolCtx: ToolContext = {
    deviceId: userId,
    userId,
    sessionId: session.id,
    getMessages: () => session.context.getHistory(),
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

  // 数据/时间查询检测：动态设置 toolChoice + 注入提示
  let messagesForModel = messages;
  let toolChoice: any = undefined; // 默认 auto

  if (lastUserMsg) {
    if (isTimeQuery(lastUserMsg.content)) {
      toolChoice = { type: "tool", toolName: "get_current_time" };
      console.log(`[chat] Time query detected, forcing get_current_time`);
    } else if (isDataQuery(lastUserMsg.content)) {
      toolChoice = "required";
      console.log(`[chat] Data query detected, toolChoice=required`);
      messagesForModel = [
        ...messages.slice(0, -1),
        { role: "system" as const, content: "[系统提示] 用户正在询问实际数据。你必须调用工具查询真实数据后再回答。禁止根据对话历史或上下文推测，数据可能已更新。" },
        messages[messages.length - 1],
      ];
    }
  }

  const stream = streamWithTools(
    messagesForModel,
    aiTools,
    { temperature: 0.7, maxSteps: 5, tier, toolChoice },
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
 * End a chat session.
 * Soul/Profile/UserAgent 的更新主要由 AI 在对话中通过工具自主完成。
 * AI 日记由 daily-loop 的 generateChatDiary 批量生成。
 * endChat 做轻量 fallback 检测 + 清理 session。
 */
export async function endChat(userId: string): Promise<void> {
  const session = getSession(userId);
  if (session.mode !== "chat") return;

  // 轻量 fallback: 如果对话中有明显的 soul/profile 信号但 AI 没调工具，
  // 异步触发后台更新（不阻塞 endChat）
  if (userId) {
    const history = session.context.getHistory();
    const userMessages = history.filter(m => m.role === "user").map(m => m.content);
    if (userMessages.length > 0) {
      const userText = userMessages.join(" ");
      // Soul 信号: 用户直接对 AI 下指令
      const soulSignals = [
        /你(以后|今后|之后).{0,6}(要|可以|不要|别|简洁|啰嗦|客气)/,
        /你.{0,4}(风格|语气|方式)/, /(叫我|称呼我|喊我)/,
      ];
      const hasSoulSignal = soulSignals.some(p => p.test(userText));
      // Profile 信号: 用户透露身份信息
      const profileSignals = [
        /我(换了|在|做|是).{0,10}(工作|职业|公司)/,
        /我(搬|住|在).{0,6}(到|了)/,
      ];
      const hasProfileSignal = profileSignals.some(p => p.test(userText));

      if (hasSoulSignal || hasProfileSignal) {
        const summary = history
          .filter(m => m.role === "user" || m.role === "assistant")
          .map(m => `${m.role}: ${m.content.slice(0, 200)}`).join("\n");
        if (hasSoulSignal) {
          import("../soul/manager.js").then(({ updateSoul }) =>
            updateSoul(userId, `[对话 fallback] ${summary}`, userId),
          ).catch(() => {});
        }
        if (hasProfileSignal) {
          import("../profile/manager.js").then(({ updateProfile }) =>
            updateProfile(userId, `[对话 fallback] ${summary}`, userId),
          ).catch(() => {});
        }
        console.log(`[chat] endChat fallback: soul=${hasSoulSignal}, profile=${hasProfileSignal}`);
      }
    }
  }

  session.mode = "idle";
  session.context.clear();
}

/** 导出 toolRegistry 供 MCP server 等外部模块使用 */
export { toolRegistry };
