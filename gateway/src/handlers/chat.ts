import { loadSkills, mergeWithCustomSkills } from "../skills/loader.js";
import type { Skill } from "../skills/types.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { streamWithTools } from "../ai/provider.js";
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
import { createDefaultRegistry } from "../tools/definitions/index.js";
import type { ToolContext } from "../tools/types.js";
import { mayProfileUpdate } from "../lib/text-utils.js";
import { shouldUpdateSoulStrict } from "../cognitive/self-evolution.js";
import { gatherDecisionContext, buildDecisionPrompt } from "../cognitive/decision.js";
import { generateAlerts } from "../cognitive/alerts.js";
import { detectCognitiveQuery, loadChatCognitive, buildGoalDiscussionContext, buildInsightDiscussionContext, saveConversationAsRecord } from "../cognitive/advisor-context.js";
import type { ModelTier } from "../ai/provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INSIGHTS_DIR = join(__dirname, "../../insights");

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

  // Build skills — load from insights/ for selected insight skill
  let activeSkills: Skill[] = [];
  const selectedName = payload.localConfig?.skills?.selectedInsightSkill
    ?? payload.localConfig?.skills?.selectedReviewSkill;

  if (selectedName && (payload.mode === "review" || payload.mode === "insight")) {
    const insights = loadSkills(INSIGHTS_DIR);
    const merged = mergeWithCustomSkills(insights, payload.localConfig?.skills?.configs as any);
    const found = merged.find(s => s.name === selectedName);
    if (found) activeSkills = [found];
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

  // 构建 system prompt（不再注入工具调用规则，由 AI SDK 原生处理）
  const systemPrompt = buildSystemPrompt({
    skills: activeSkills,
    soul: soul?.content,
    userProfile: loaded.userProfile,
    memory: memories,
    mode: "chat",
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
    // Command mode: skip review, respond directly to the initial message
    if (payload.assistantPreamble) {
      session.context.addMessage({ role: "assistant", content: payload.assistantPreamble });
    }
    const msg = payload.initialMessage?.trim() || "/";
    session.context.addMessage({ role: "user", content: msg });
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

  // Stream initial response — review/insight/decision 初次回复需要推理，command 走自动分类
  const initialTier = (payload.mode === "review" || payload.mode === "insight" || payload.mode === "decision")
    ? "chat" as ModelTier
    : undefined;
  return streamWithNativeTools(session, payload.deviceId, initialTier);
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

    // 场景 5: 有价值的对话保存为日记 record，进入 Digest 管道
    if (history.length >= 4 && userId) {
      const messages = history.map(m => ({ role: m.role, content: m.content }));
      saveConversationAsRecord(messages, userId, deviceId).catch((e) => {
        console.warn(`[chat] Save conversation failed: ${e.message}`);
      });
    }
  }

  session.mode = "idle";
  session.context.clear();
}

/** 导出 toolRegistry 供 MCP server 等外部模块使用 */
export { toolRegistry };
