import { loadSkills, filterActiveSkills } from "../skills/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { chatCompletionStream } from "../ai/provider.js";
import { MemoryManager } from "../memory/manager.js";
import { loadSoul, updateSoul } from "../soul/manager.js";
import { getSession } from "../session/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
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
    // Load context
    const soul = await loadSoul(payload.deviceId);
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
    // Build skills
    const allSkills = loadSkills(SKILLS_DIR);
    const activeSkills = filterActiveSkills(allSkills);
    const systemPrompt = buildSystemPrompt({
        skills: activeSkills,
        soul: soul?.content,
        memory: memories,
        mode: "chat",
    });
    // Set up session context
    session.context.setSystemPrompt(systemPrompt);
    // Add the transcript context as a user message
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
    // Stream initial response
    return chatCompletionStream(session.context.getMessages());
}
/**
 * Send a message in an ongoing chat session.
 */
export async function sendChatMessage(deviceId, text) {
    const session = getSession(deviceId);
    if (session.mode !== "chat") {
        throw new Error("No active chat session");
    }
    session.context.addMessage({ role: "user", content: text });
    return chatCompletionStream(session.context.getMessages());
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