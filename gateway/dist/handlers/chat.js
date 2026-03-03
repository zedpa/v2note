import { loadSkills, filterActiveSkills, mergeWithCustomSkills } from "../skills/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { chatCompletion, chatCompletionStream } from "../ai/provider.js";
import { MemoryManager } from "../memory/manager.js";
import { loadSoul, updateSoul } from "../soul/manager.js";
import { getSession } from "../session/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { isBuiltinTool, callBuiltinTool } from "../tools/builtin.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");
/**
 * Start a review chat session.
 * Loads memory, soul, and skills into the session context.
 * Returns the initial AI greeting.
 */
export async function startChat(payload) {
    const session = getSession(payload.deviceId);
    session.mode = "chat";
    // Load context: prefer localConfig soul, fall back to server DB
    const soul = payload.localConfig?.soul
        ? { content: payload.localConfig.soul.content }
        : await loadSoul(payload.deviceId);
    const memoryManager = new MemoryManager();
    const memories = await memoryManager.loadContext(payload.deviceId, payload.dateRange);
    // Load records from the date range for context
    const records = await recordRepo.findByDeviceAndDateRange(payload.deviceId, `${payload.dateRange.start}T00:00:00`, `${payload.dateRange.end}T23:59:59`);
    // Load transcripts for these records
    let transcriptSummary = "";
    if (records.length > 0) {
        const recordIds = records.map((r) => r.id);
        const transcripts = await transcriptRepo.findByRecordIds(recordIds);
        if (transcripts.length > 0) {
            transcriptSummary = transcripts
                .map((t) => {
                const record = records.find((r) => r.id === t.record_id);
                const date = record
                    ? new Date(record.created_at).toLocaleDateString("zh-CN")
                    : "";
                return `[${date}] ${t.text}`;
            })
                .join("\n\n");
        }
    }
    // Build skills — merge built-in + custom, then filter
    const builtinSkills = loadSkills(SKILLS_DIR);
    const allSkills = mergeWithCustomSkills(builtinSkills, payload.localConfig?.skills?.configs);
    const skillConfigs = payload.localConfig?.skills?.configs?.map((c) => ({
        skill_name: c.name,
        enabled: c.enabled,
    }));
    let activeSkills;
    if (payload.mode === "review") {
        // Review mode: only apply the single selected review skill (if any)
        const selectedName = payload.localConfig?.skills?.selectedReviewSkill;
        if (selectedName) {
            const reviewSkills = filterActiveSkills(allSkills, skillConfigs, "review");
            activeSkills = reviewSkills.filter((s) => s.name === selectedName);
        }
        else {
            activeSkills = []; // No review skill selected → default conversation
        }
    }
    else {
        // Command mode: no review skills, just tools available
        activeSkills = [];
    }
    const systemPrompt = buildSystemPrompt({
        skills: activeSkills,
        soul: soul?.content,
        memory: memories,
        mode: "chat",
    });
    // Set up session context
    session.context.setSystemPrompt(systemPrompt);
    if (payload.mode === "command") {
        // Command mode: skip review, respond directly to the initial message
        const msg = payload.initialMessage?.trim() || "/";
        session.context.addMessage({ role: "user", content: msg });
    }
    else {
        // Review mode: load transcript context then stream initial review
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
    // Stream initial response (with tool-call support)
    return streamWithToolCalls(session, payload.deviceId);
}
/**
 * Send a message in an ongoing chat session.
 * Supports built-in tool calls: if AI responds with tool_calls JSON,
 * execute them and re-call AI for the final streaming response.
 */
export async function sendChatMessage(deviceId, text) {
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
 * Returns [toolCalls, textPart] or null if no tool calls found.
 */
function extractToolCalls(content) {
    // 1. Try pure JSON parse
    try {
        const parsed = JSON.parse(content.trim());
        if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
            return { toolCalls: parsed.tool_calls, textPart: "" };
        }
    }
    catch {
        // Not pure JSON, try regex extraction
    }
    // 2. Try to find JSON object containing tool_calls in mixed text
    // Match: {"tool_calls": [...]} or {  "tool_calls" : [...] }
    const jsonMatch = content.match(/\{[\s\S]*?"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
                const textPart = content.replace(jsonMatch[0], "").trim();
                return { toolCalls: parsed.tool_calls, textPart };
            }
        }
        catch {
            // JSON parse failed
        }
    }
    // 3. Try to find tool_calls array directly (AI sometimes outputs without wrapping {})
    // Match: tool_calls: [{"name": ...}]
    const arrayMatch = content.match(/tool_calls\s*[:：]\s*(\[[\s\S]*?\])/);
    if (arrayMatch) {
        try {
            const arr = JSON.parse(arrayMatch[1]);
            if (Array.isArray(arr) && arr.length > 0) {
                const textPart = content.replace(arrayMatch[0], "").trim();
                return { toolCalls: arr, textPart };
            }
        }
        catch {
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
async function* streamWithToolCalls(session, deviceId) {
    const MAX_TOOL_ROUNDS = 3;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // Non-streaming call to check for tool_calls
        const response = await chatCompletion(session.context.getMessages(), {
            temperature: 0.7,
        });
        const content = response.content.trim();
        if (!content)
            break;
        // Try to extract tool_calls (handles pure JSON and mixed text)
        const extracted = extractToolCalls(content);
        if (!extracted) {
            // No tool calls — normal text response
            session.context.addMessage({ role: "assistant", content });
            yield content;
            return;
        }
        // Execute tool calls
        console.log(`[chat] Tool call round ${round + 1}: ${extracted.toolCalls.length} calls`);
        const toolResults = [];
        for (const call of extracted.toolCalls) {
            if (isBuiltinTool(call.name)) {
                const res = await callBuiltinTool(call.name, call.arguments ?? {}, deviceId);
                toolResults.push(`工具 "${call.name}" 结果: ${res.message}`);
                console.log(`[chat] Built-in tool ${call.name}: ${res.success ? "success" : "failed"}`);
            }
            else {
                toolResults.push(`工具 "${call.name}" 错误: 未知工具`);
            }
        }
        // Feed results back and continue loop
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
export async function endChat(deviceId) {
    const session = getSession(deviceId);
    if (session.mode !== "chat")
        return;
    const history = session.context.getHistory();
    if (history.length > 0) {
        const summary = history
            .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
            .join("\n");
        // Update soul with conversation insights
        updateSoul(deviceId, `[复盘对话] ${summary}`).catch(() => { });
    }
    session.mode = "idle";
    session.context.clear();
}
//# sourceMappingURL=chat.js.map