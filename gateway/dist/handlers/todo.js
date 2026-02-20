import { chatCompletion } from "../ai/provider.js";
import { todoRepo } from "../db/repositories/index.js";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
/**
 * Aggregate all pending todos for a device into a formatted diary entry.
 */
export async function aggregateTodos(deviceId) {
    // Fetch pending todos for this device
    const deviceTodos = await todoRepo.findPendingByDevice(deviceId);
    if (deviceTodos.length === 0) {
        return { diary_entry: "当前没有待办事项。" };
    }
    // Group by date
    const grouped = {};
    for (const todo of deviceTodos) {
        const date = new Date(todo.created_at).toLocaleDateString("zh-CN");
        if (!grouped[date])
            grouped[date] = [];
        grouped[date].push(todo.text);
    }
    // Use AI to format into a diary entry
    const todoText = Object.entries(grouped)
        .map(([date, items]) => `${date}:\n${items.map((t) => `- ${t}`).join("\n")}`)
        .join("\n\n");
    const result = await chatCompletion([
        {
            role: "system",
            content: `将以下待办事项整理成一段简洁的日记条目。按优先级和关联性重新组织，去除重复。用自然的语言，不要用列表格式。`,
        },
        { role: "user", content: todoText },
    ], { temperature: 0.5 });
    // Save as a new record
    const record = await recordRepo.create({
        device_id: deviceId,
        status: "completed",
        source: "todo_aggregate",
    });
    await transcriptRepo.create({
        record_id: record.id,
        text: result.content,
        language: "zh",
    });
    return { diary_entry: result.content };
}
//# sourceMappingURL=todo.js.map