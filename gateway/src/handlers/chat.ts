import { loadSkills, mergeWithCustomSkills } from "../skills/loader.js";
import type { Skill } from "../skills/types.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { chatCompletion, chatCompletionStream } from "../ai/provider.js";
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
import { isBuiltinTool, callBuiltinTool } from "../tools/builtin.js";
import { maySoulUpdate, mayProfileUpdate } from "../lib/text-utils.js";
import { gatherDecisionContext, buildDecisionPrompt } from "../cognitive/decision.js";
import { generateAlerts } from "../cognitive/alerts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INSIGHTS_DIR = join(__dirname, "../../insights");

/** Max characters for transcript context injected into prompt */
const MAX_TRANSCRIPT_CHARS = 8000;

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
        pendingIntentContext = `\n## 待确认意图\n以下是用户近期提到但未确认的愿望/目标，在对话中自然地跟进（不要一开口就问，找合适时机）：\n${lines.join("\n")}\n不要逐条审问用户，自然聊天中确认即可。确认后使用 confirm_intent 工具处理。`;
      }
    } catch (err: any) {
      console.warn(`[chat] Failed to load pending intents: ${err.message}`);
    }
  }

  // Load cognitive context for review/insight modes
  let cognitiveContext: string | undefined;
  if (payload.mode === "review" || payload.mode === "insight") {
    try {
      const uid = payload.userId ?? payload.deviceId;
      const alerts = await generateAlerts(uid);
      if (alerts.length > 0) {
        cognitiveContext = alerts.slice(0, 5).map((a) => {
          const aShort = a.strikeA.nucleus.slice(0, 40);
          const bShort = a.strikeB.nucleus.slice(0, 40);
          return `- 用户之前说过「${aShort}」，后来又说「${bShort}」，想法有所变化`;
        }).join("\n");
      }
    } catch {
      // non-critical
    }
  }

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

  // Stream initial response (with tool-call support)
  return streamWithToolCalls(session, payload.deviceId);
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

  session.context.addMessage({ role: "user", content: text });
  return streamWithToolCalls(session, deviceId);
}

/**
 * Extract tool_calls from AI response text.
 * Handles both pure JSON and mixed text+JSON responses.
 */
function extractToolCalls(content: string): { toolCalls: any[]; textPart: string } | null {
  // 1. Try pure JSON parse
  try {
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      return { toolCalls: parsed.tool_calls, textPart: "" };
    }
  } catch {
    // Not pure JSON
  }

  // 2. Try to find JSON object containing tool_calls in mixed text
  const jsonMatch = content.match(/\{[\s\S]*?"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        const textPart = content.replace(jsonMatch[0], "").trim();
        return { toolCalls: parsed.tool_calls, textPart };
      }
    } catch {
      // JSON parse failed
    }
  }

  // 3. Try to find tool_calls array directly
  const arrayMatch = content.match(/tool_calls\s*[:：]\s*(\[[\s\S]*?\])/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[1]);
      if (Array.isArray(arr) && arr.length > 0) {
        const textPart = content.replace(arrayMatch[0], "").trim();
        return { toolCalls: arr, textPart };
      }
    } catch {
      // parse failed
    }
  }

  return null;
}

/**
 * Stream response with tool-call loop support.
 * Up to 3 rounds: if the AI returns tool_calls, execute them
 * and re-call AI. Final round always streams.
 */
async function* streamWithToolCalls(
  session: ReturnType<typeof getSession>,
  deviceId: string,
): AsyncGenerator<string, void, undefined> {
  const MAX_TOOL_ROUNDS = 3;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatCompletion(session.context.getMessages(), {
      temperature: 0.7,
    });

    const content = response.content.trim();
    if (!content) break;

    const extracted = extractToolCalls(content);

    if (!extracted) {
      // No tool calls — normal text response
      session.context.addMessage({ role: "assistant", content });
      yield content;
      return;
    }

    // Execute tool calls
    console.log(`[chat] Tool call round ${round + 1}: ${extracted.toolCalls.length} calls`);
    const toolResults: string[] = [];
    for (const call of extracted.toolCalls) {
      if (isBuiltinTool(call.name)) {
        const res = await callBuiltinTool(call.name, call.arguments ?? {}, deviceId, session.userId);
        toolResults.push(`工具 "${call.name}" 结果: ${res.message}`);
        console.log(`[chat] Built-in tool ${call.name}: ${res.success ? "success" : "failed"}`);
      } else {
        toolResults.push(`工具 "${call.name}" 错误: 未知工具`);
      }
    }

    session.context.addMessage({ role: "assistant", content });
    session.context.addMessage({
      role: "user",
      content: `工具调用结果：\n${toolResults.join("\n")}\n\n请基于工具执行结果，给用户一个简短的自然语言回复。不要再输出 tool_calls。`,
    });
  }

  // Final round: stream the response
  const stream = chatCompletionStream(session.context.getMessages());
  for await (const chunk of stream) {
    yield chunk;
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
    if (maySoulUpdate(userText)) {
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
