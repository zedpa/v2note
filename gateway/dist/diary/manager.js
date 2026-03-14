import { chatCompletion } from "../ai/provider.js";
import { aiDiaryRepo, notebookRepo } from "../db/repositories/index.js";
import { MemoryManager } from "../memory/manager.js";
/**
 * Append content to today's diary for a specific notebook.
 * Fast operation — no AI call, just DB append.
 */
export async function appendToDiary(deviceId, notebook, content) {
    const today = new Date().toISOString().split("T")[0];
    await notebookRepo.ensureSystemNotebooks(deviceId);
    await aiDiaryRepo.upsertEntry(deviceId, notebook, today, content);
}
/**
 * Regenerate the summary (first ~20 lines) for a diary entry.
 * Uses AI to create a concise summary.
 */
export async function regenerateSummary(deviceId, notebook, date) {
    const entry = await aiDiaryRepo.findFull(deviceId, notebook, date);
    if (!entry || !entry.full_content.trim())
        return;
    const result = await chatCompletion([
        {
            role: "system",
            content: `你是一个日记摘要生成器。将以下日记内容生成一个不超过20行的摘要。
保留关键事件、决策、情绪和重要数字。用简洁的要点形式，不需要完整句子。
直接输出摘要内容，不要加标题或前缀。`,
        },
        {
            role: "user",
            content: entry.full_content,
        },
    ], { temperature: 0.3 });
    await aiDiaryRepo.updateSummary(entry.id, result.content);
    console.log(`[diary] Summary regenerated for ${notebook}/${date}`);
}
/**
 * Extract long-term memories from diary entries within a date range.
 * Identifies recurring patterns, important changes, and key insights.
 */
export async function extractToMemory(deviceId, dateRange) {
    const entries = await aiDiaryRepo.findSummaries(deviceId, "default", dateRange.start, dateRange.end);
    if (entries.length === 0)
        return;
    const diaryContent = entries
        .map((e) => `[${e.entry_date}] ${e.summary}`)
        .join("\n\n");
    const result = await chatCompletion([
        {
            role: "system",
            content: `分析以下日记摘要，提取值得长期记住的内容。
关注：反复出现的模式、重要的变化、关键决策、情绪趋势。
每条记忆用一行表示，格式："[类型] 内容"
类型可以是：习惯、偏好、关系、能力、目标进展、情绪模式
只输出值得长期记住的内容，不要输出临时性信息。
如果没有值得提取的内容，输出空行。`,
        },
        {
            role: "user",
            content: diaryContent,
        },
    ], { temperature: 0.3 });
    const lines = result.content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length === 0)
        return;
    const memoryManager = new MemoryManager();
    for (const line of lines) {
        await memoryManager.maybeCreateMemory(deviceId, line, dateRange.end);
    }
    console.log(`[diary] Extracted ${lines.length} memories from ${dateRange.start} to ${dateRange.end}`);
}
//# sourceMappingURL=manager.js.map