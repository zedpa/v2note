import { loadSkills, mergeWithCustomSkills } from "../skills/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { streamWithTools } from "../ai/provider.js";
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
import { mayProfileUpdate } from "../lib/text-utils.js";
import { shouldUpdateSoulStrict } from "../cognitive/self-evolution.js";
import { gatherDecisionContext, buildDecisionPrompt } from "../cognitive/decision.js";
import { detectCognitiveQuery, loadChatCognitive, saveConversationAsRecord } from "../cognitive/advisor-context.js";
import { computeMood, buildMoodPromptSection } from "../companion/mood.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const INSIGHTS_DIR = join(__dirname, "../../insights");
/** Max characters for transcript context injected into prompt */
const MAX_TRANSCRIPT_CHARS = 8000;
/** 全局工具注册表——启动时初始化一次 */
const toolRegistry = createDefaultRegistry();
/**
 * Start a review/insight chat session.
 * Loads memory, soul, and skills into the session context.
 * Returns the initial AI greeting.
 */
export async function startChat(payload) {
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
        ? await recordRepo.findByUserAndDateRange(payload.userId, `${payload.dateRange.start}T00:00:00`, `${payload.dateRange.end}T23:59:59`)
        : await recordRepo.findByDeviceAndDateRange(payload.deviceId, `${payload.dateRange.start}T00:00:00`, `${payload.dateRange.end}T23:59:59`);
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
    let activeSkills = [];
    const selectedName = payload.localConfig?.skills?.selectedInsightSkill
        ?? payload.localConfig?.skills?.selectedReviewSkill;
    if (selectedName && (payload.mode === "review" || payload.mode === "insight")) {
        const insights = loadSkills(INSIGHTS_DIR);
        const merged = mergeWithCustomSkills(insights, payload.localConfig?.skills?.configs);
        const found = merged.find(s => s.name === selectedName);
        if (found)
            activeSkills = [found];
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
        }
        catch (err) {
            console.warn(`[chat] Failed to load pending intents: ${err.message}`);
        }
    }
    // Load cognitive context for review/insight modes (enriched with clusters + alerts)
    let cognitiveContext;
    if (payload.mode === "review" || payload.mode === "insight") {
        try {
            const uid = payload.userId ?? payload.deviceId;
            const cognitive = await loadChatCognitive(uid);
            if (cognitive.contextString) {
                cognitiveContext = cognitive.contextString;
            }
        }
        catch {
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
    // 注入路路心情（场景 6.2）
    let moodSection = "";
    try {
        const hour = new Date().getHours();
        const moodResult = computeMood({
            completedTodayCount: 0, // 简化：后续可从 todoRepo 查
            hasNewCluster: false,
            hasSkippedTodo: false,
            hoursSinceLastRecord: 0,
            currentHour: hour,
            isDigestRunning: false,
        });
        moodSection = buildMoodPromptSection(moodResult);
    }
    catch { /* non-critical */ }
    // Set up session context
    session.context.setSystemPrompt(moodSection ? `${systemPrompt}\n\n${moodSection}` : systemPrompt);
    if (payload.mode === "decision") {
        // Decision mode: deep cognitive graph traversal for decision support
        const userId = payload.userId ?? payload.deviceId;
        const question = payload.initialMessage?.trim() || "帮我分析这个问题";
        const decisionCtx = await gatherDecisionContext(question, userId);
        const decisionPrompt = buildDecisionPrompt(decisionCtx);
        // Override system prompt with decision-specific prompt
        session.context.setSystemPrompt(decisionPrompt);
        session.context.addMessage({ role: "user", content: question });
    }
    else if (payload.mode === "command") {
        // Command mode: skip review, respond directly to the initial message
        if (payload.assistantPreamble) {
            session.context.addMessage({ role: "assistant", content: payload.assistantPreamble });
        }
        const msg = payload.initialMessage?.trim() || "/";
        session.context.addMessage({ role: "user", content: msg });
    }
    else {
        // Review/insight mode: load transcript context then stream initial review
        if (transcriptSummary) {
            session.context.addMessage({
                role: "user",
                content: `以下是 ${payload.dateRange.start} 到 ${payload.dateRange.end} 期间的记录内容：\n\n${transcriptSummary}\n\n请基于这些内容开始复盘对话。`,
            });
        }
        else {
            session.context.addMessage({
                role: "user",
                content: `请开始 ${payload.dateRange.start} 到 ${payload.dateRange.end} 的复盘。这段时间暂无录音记录。`,
            });
        }
    }
    // Stream initial response with native tool calling
    return streamWithNativeTools(session, payload.deviceId);
}
/**
 * Send a message in an ongoing chat session.
 */
export async function sendChatMessage(deviceId, text) {
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
        }
        catch {
            // non-critical
        }
    }
    session.context.addMessage({ role: "user", content: text });
    return streamWithNativeTools(session, deviceId);
}
/**
 * Stream response using Vercel AI SDK native function calling.
 *
 * Replaces the old manual JSON extraction + 3-round loop.
 * AI SDK handles tool execution automatically via maxSteps.
 */
async function* streamWithNativeTools(session, deviceId) {
    // 构建工具执行上下文
    const toolCtx = {
        deviceId,
        userId: session.userId,
        sessionId: session.id,
    };
    // 将注册表导出为 AI SDK tools 格式（绑定执行上下文）
    const aiTools = toolRegistry.toAISDKTools(toolCtx);
    // 使用 AI SDK streamText + tools + maxSteps
    // AI SDK 自动处理：工具调用 → 执行 → 结果反馈 → 继续生成
    const stream = streamWithTools(session.context.getMessages(), aiTools, { temperature: 0.7, maxSteps: 5 });
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
export async function endChat(deviceId) {
    const session = getSession(deviceId);
    if (session.mode !== "chat")
        return;
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
//# sourceMappingURL=chat.js.map