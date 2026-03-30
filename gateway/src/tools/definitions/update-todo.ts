import { z } from "zod";
import { todoRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const updateTodoTool: ToolDefinition = {
  name: "update_todo",
  description: `更新待办事项——修改文本、时间、优先级，或标记完成/重新打开。
使用：用户要修改待办（"改一下时间"、"标记完成"、"把那个待办改成xxx"）。
不用：用户要删除待办 → 用 delete_todo。
不用：用户要创建新待办 → 用 create_todo。`,
  parameters: z.object({
    todo_id: z.string().min(1).describe("待办事项 ID"),
    text: z.string().optional().describe("可选：新的待办文本"),
    done: z.boolean().optional().describe("可选：true=标记完成，false=重新打开"),
    scheduled_start: z.string().nullable().optional().describe("可选：开始时间（ISO字符串，null 清除）"),
    scheduled_end: z.string().nullable().optional().describe("可选：结束时间（ISO字符串，null 清除）"),
    estimated_minutes: z.number().optional().describe("可选：预估时长（分钟）"),
    priority: z.number().optional().describe("可选：优先级（整数，越大越高）"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    const { todo_id, ...fields } = args;

    const updates: Record<string, any> = {};
    if (fields.text !== undefined) updates.text = fields.text;
    if (fields.done !== undefined) updates.done = fields.done;
    if (fields.scheduled_start !== undefined) updates.scheduled_start = fields.scheduled_start ?? null;
    if (fields.scheduled_end !== undefined) updates.scheduled_end = fields.scheduled_end ?? null;
    if (fields.estimated_minutes !== undefined) updates.estimated_minutes = fields.estimated_minutes;
    if (fields.priority !== undefined) updates.priority = fields.priority;

    if (Object.keys(updates).length === 0) {
      return { success: false, message: "没有提供需要更新的字段" };
    }

    await todoRepo.update(todo_id, updates);

    const action = updates.done === true ? "已标记完成" : "已更新";
    return {
      success: true,
      message: `待办${action} (ID: ${todo_id})`,
      data: { todo_id, ...updates },
    };
  },
};
