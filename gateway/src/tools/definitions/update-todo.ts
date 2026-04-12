import { z } from "zod";
import { todoRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

/** 裸时间字符串补上 +08:00（防御 AI 不带时区偏移） */
function ensureTz(ts: string | undefined | null): string | null {
  if (!ts) return null;
  if (/[+-]\d{2}:\d{2}$/.test(ts) || /Z$/i.test(ts)) return ts;
  return `${ts}+08:00`;
}

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
    scheduled_start: z.string().nullable().optional().describe("可选：开始时间（必须带时区的 ISO 字符串如 2026-04-11T07:30:00+08:00，null 清除）"),
    scheduled_end: z.string().nullable().optional().describe("可选：结束时间（必须带时区的 ISO 字符串，null 清除）"),
    estimated_minutes: z.number().optional().describe("可选：预估时长（分钟）"),
    priority: z.number().optional().describe("可选：优先级（整数，越大越高）"),
    reminder_before: z.number().min(1).nullable().optional().describe("可选：提前提醒分钟数（null=清除提醒）"),
    reminder_types: z.array(z.enum(["notification", "alarm", "calendar"])).nullable().optional()
      .describe("可选：提醒类型"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    const { todo_id, ...fields } = args;

    const updates: Record<string, any> = {};
    if (fields.text !== undefined) updates.text = fields.text;
    if (fields.done !== undefined) updates.done = fields.done;
    if (fields.scheduled_start !== undefined) updates.scheduled_start = fields.scheduled_start === null ? null : ensureTz(fields.scheduled_start);
    if (fields.scheduled_end !== undefined) updates.scheduled_end = fields.scheduled_end === null ? null : ensureTz(fields.scheduled_end);
    if (fields.estimated_minutes !== undefined) updates.estimated_minutes = fields.estimated_minutes;
    if (fields.priority !== undefined) updates.priority = fields.priority;

    // 处理 reminder 字段
    if (fields.reminder_before === null) {
      // 清除提醒
      updates.reminder_at = null;
      updates.reminder_before = null;
      updates.reminder_types = null;
    } else if (fields.reminder_before !== undefined && fields.reminder_before > 0) {
      updates.reminder_before = fields.reminder_before;
      if (fields.reminder_types) updates.reminder_types = fields.reminder_types;
      // 如果同时有 scheduled_start，直接计算 reminder_at
      if (fields.scheduled_start) {
        updates.reminder_at = new Date(
          new Date(ensureTz(fields.scheduled_start)!).getTime() - fields.reminder_before * 60000,
        ).toISOString();
      }
    }
    if (fields.reminder_types !== undefined && fields.reminder_before === undefined) {
      updates.reminder_types = fields.reminder_types;
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, message: "没有提供需要更新的字段" };
    }

    await todoRepo.update(todo_id, updates);

    // scheduled_start 设为 null → 也要清除 reminder_at（不然残留旧提醒）
    if (fields.scheduled_start === null && fields.reminder_before === undefined) {
      await todoRepo.update(todo_id, { reminder_at: null });
    }
    // scheduled_start 变更（非 null）但未传 reminder_before → recalc
    else if (fields.scheduled_start !== undefined && fields.scheduled_start !== null && fields.reminder_before === undefined) {
      await todoRepo.recalcReminderAt(todo_id);
    }
    // 传了 reminder_before 但没传 scheduled_start → 也需要 recalc（用 DB 中已有的 scheduled_start）
    if (fields.reminder_before !== undefined && fields.reminder_before > 0 && fields.scheduled_start === undefined) {
      await todoRepo.recalcReminderAt(todo_id);
    }

    const action = updates.done === true ? "已标记完成" : "已更新";
    return {
      success: true,
      message: `待办${action} (ID: ${todo_id})`,
      data: { todo_id, ...updates },
    };
  },
};
