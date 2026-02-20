import { ShortTermMemory } from "./short-term.js";
import { loadMemory, saveMemory } from "./long-term.js";
import { chatCompletion } from "../ai/provider.js";
/**
 * MemoryManager combines short-term (session) and long-term (Supabase) memory.
 */
export class MemoryManager {
    shortTerm = new ShortTermMemory();
    /**
     * Load relevant memories for a session.
     */
    async loadContext(deviceId, dateRange) {
        const longTerm = await loadMemory(deviceId, dateRange);
        const shortTermEntries = this.shortTerm.getAll();
        const memories = [];
        // Add short-term context
        if (shortTermEntries.length > 0) {
            memories.push(`[近期对话] ${this.shortTerm.getSummary()}`);
        }
        // Add long-term memories
        for (const entry of longTerm) {
            memories.push(`[${entry.source_date ?? "未知日期"}] ${entry.content}`);
        }
        return memories;
    }
    /**
     * Add to short-term memory.
     */
    addShortTerm(content) {
        this.shortTerm.add(content);
    }
    /**
     * After processing a record, use AI to decide if a long-term memory should be created.
     */
    async maybeCreateMemory(deviceId, content, date) {
        const result = await chatCompletion([
            {
                role: "system",
                content: `判断以下内容是否值得作为长期记忆保存。只保存重要的事实、决定、承诺或关键事件。
返回 JSON: {"save": true/false, "summary": "简洁摘要", "importance": 1-10}
如果不值得保存，返回 {"save": false}`,
            },
            { role: "user", content },
        ], { json: true, temperature: 0.3 });
        try {
            const parsed = JSON.parse(result.content);
            if (parsed.save && parsed.summary) {
                await saveMemory(deviceId, parsed.summary, date, parsed.importance ?? 5);
            }
        }
        catch {
            // Skip if AI response can't be parsed
        }
    }
    clearShortTerm() {
        this.shortTerm.clear();
    }
}
//# sourceMappingURL=manager.js.map