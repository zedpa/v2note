/**
 * Built-in tools that the AI can invoke during processing or chat.
 * These run in-process (no MCP server needed).
 */
import { recordRepo, transcriptRepo, summaryRepo, customSkillRepo, todoRepo } from "../db/repositories/index.js";
/**
 * Definitions exposed to the AI via system prompt.
 */
export const BUILTIN_TOOLS = [
    {
        name: "create_diary",
        description: "创建一条新的日记/笔记。用户在对话中要求你帮忙记录内容时使用此工具。",
        parameters: {
            type: "object",
            properties: {
                content: { type: "string", description: "日记正文内容" },
                title: { type: "string", description: "标题（可选，不超过50字）" },
            },
            required: ["content"],
        },
    },
    {
        name: "create_todo",
        description: "创建一条新的待办事项。用户提出具体行动时使用此工具。",
        parameters: {
            type: "object",
            properties: {
                text: { type: "string", description: "待办文本（动词开头，简洁可执行）" },
                link_record_id: { type: "string", description: "可选：关联到已有记录的ID" },
                scheduled_start: { type: "string", description: "可选：开始时间（ISO字符串）" },
                scheduled_end: { type: "string", description: "可选：结束时间（ISO字符串）" },
                estimated_minutes: { type: "number", description: "可选：预估时长（分钟）" },
                priority: { type: "number", description: "可选：优先级（整数，越大越高）" },
            },
            required: ["text"],
        },
    },
    {
        name: "delete_diary",
        description: "删除指定的日记/笔记。用户明确要求删除某条记录时使用此工具。需要提供记录 ID。",
        parameters: {
            type: "object",
            properties: {
                record_id: { type: "string", description: "要删除的记录 ID" },
            },
            required: ["record_id"],
        },
    },
    {
        name: "create_skill",
        description: "创建一个新的复盘视角技能。当用户总结出有价值的思考框架时，保存为可复用的复盘视角。",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "技能名称（如'用户体验视角'）" },
                description: { type: "string", description: "简短描述" },
                prompt: { type: "string", description: "提示词/引导指令" },
            },
            required: ["name", "prompt"],
        },
    },
];
/**
 * Check if a tool name is a built-in tool.
 */
export function isBuiltinTool(name) {
    return BUILTIN_TOOLS.some((t) => t.name === name);
}
/**
 * Execute a built-in tool call.
 */
export async function callBuiltinTool(name, args, deviceId) {
    switch (name) {
        case "create_diary":
            return handleCreateDiary(args, deviceId);
        case "create_todo":
            return handleCreateTodo(args, deviceId);
        case "delete_diary":
            return handleDeleteDiary(args, deviceId);
        case "create_skill":
            return handleCreateSkill(args, deviceId);
        default:
            return { success: false, message: `Unknown built-in tool: ${name}` };
    }
}
async function handleCreateTodo(args, deviceId) {
    const text = String(args.text ?? "").trim();
    if (!text) {
        return { success: false, message: "text 不能为空" };
    }
    let recordId = String(args.link_record_id ?? "").trim();
    if (recordId) {
        const rec = await recordRepo.findById(recordId);
        if (!rec) {
            return { success: false, message: `关联记录 ${recordId} 不存在` };
        }
        if (rec.device_id !== deviceId) {
            return { success: false, message: "无权关联此记录" };
        }
    }
    else {
        const rec = await recordRepo.create({
            device_id: deviceId,
            status: "completed",
            source: "chat_tool",
        });
        recordId = rec.id;
    }
    const todo = await todoRepo.create({ record_id: recordId, text, done: false });
    const updates = {};
    if (args.scheduled_start !== undefined)
        updates.scheduled_start = String(args.scheduled_start || "");
    if (args.scheduled_end !== undefined)
        updates.scheduled_end = String(args.scheduled_end || "");
    if (args.estimated_minutes !== undefined)
        updates.estimated_minutes = Number(args.estimated_minutes);
    if (args.priority !== undefined)
        updates.priority = Number(args.priority);
    // Normalize empty ISO strings to null
    if (updates.scheduled_start === "")
        updates.scheduled_start = null;
    if (updates.scheduled_end === "")
        updates.scheduled_end = null;
    const hasUpdates = Object.keys(updates).length > 0;
    if (hasUpdates) {
        await todoRepo.update(todo.id, updates);
    }
    return {
        success: true,
        message: `待办已创建: "${text}"`,
        data: { todo_id: todo.id, record_id: recordId },
    };
}
async function handleCreateDiary(args, deviceId) {
    const content = String(args.content ?? "").trim();
    if (!content) {
        return { success: false, message: "content 不能为空" };
    }
    const title = String(args.title ?? content.slice(0, 50));
    // Create record
    const record = await recordRepo.create({
        device_id: deviceId,
        status: "completed",
        source: "manual",
    });
    // Create transcript
    await transcriptRepo.create({
        record_id: record.id,
        text: content,
        language: "zh",
    });
    // Create summary
    await summaryRepo.create({
        record_id: record.id,
        title,
        short_summary: content,
    });
    console.log(`[builtin-tool] create_diary: record ${record.id} created for device ${deviceId}`);
    return {
        success: true,
        message: `日记已创建 (ID: ${record.id})`,
        data: { record_id: record.id, title },
    };
}
async function handleDeleteDiary(args, deviceId) {
    const recordId = String(args.record_id ?? "").trim();
    if (!recordId) {
        return { success: false, message: "record_id 不能为空" };
    }
    // Verify the record belongs to this device
    const record = await recordRepo.findById(recordId);
    if (!record) {
        return { success: false, message: `记录 ${recordId} 不存在` };
    }
    if (record.device_id !== deviceId) {
        return { success: false, message: "无权删除此记录" };
    }
    const count = await recordRepo.deleteByIds([recordId]);
    console.log(`[builtin-tool] delete_diary: record ${recordId} deleted (affected: ${count})`);
    return {
        success: true,
        message: `日记已删除 (ID: ${recordId})`,
        data: { record_id: recordId, deleted: count },
    };
}
async function handleCreateSkill(args, deviceId) {
    const name = String(args.name ?? "").trim();
    const prompt = String(args.prompt ?? "").trim();
    const description = String(args.description ?? "").trim();
    if (!name) {
        return { success: false, message: "name 不能为空" };
    }
    if (!prompt) {
        return { success: false, message: "prompt 不能为空" };
    }
    // Check for duplicate name
    const existing = await customSkillRepo.findByDeviceAndName(deviceId, name);
    if (existing) {
        return { success: false, message: `技能 "${name}" 已存在` };
    }
    const skill = await customSkillRepo.create({
        device_id: deviceId,
        name,
        description,
        prompt,
        type: "review",
        created_by: "ai",
    });
    console.log(`[builtin-tool] create_skill: "${name}" created for device ${deviceId}`);
    return {
        success: true,
        message: `复盘视角「${name}」已创建`,
        data: { id: skill.id, name: skill.name },
    };
}
//# sourceMappingURL=builtin.js.map