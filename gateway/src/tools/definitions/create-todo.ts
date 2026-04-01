import { z } from "zod";
import { recordRepo, todoRepo } from "../../db/repositories/index.js";
import { writeTodoEmbedding } from "../../cognitive/embed-writer.js";
import type { ToolDefinition } from "../types.js";

export const createTodoTool: ToolDefinition = {
  name: "create_todo",
  description: `创建一条待办事项。
使用：用户提到具体要做的事（"帮我建个待办"、"提醒我明天找张总"、"加个任务"）。
不用：用户只是记录想法/感受 → 用 create_record。
不用：用户要设定长期目标 → 用 create_goal。
不用：用户要求批量创建多条 → 交给 Plan 机制。`,
  parameters: z.object({
    text: z.string().min(1).describe("待办文本（动词开头，简洁可执行）"),
    link_record_id: z.string().optional().describe("可选：关联到已有记录的ID"),
    scheduled_start: z.string().optional().describe("可选：开始时间（ISO字符串）"),
    scheduled_end: z.string().optional().describe("可选：结束时间（ISO字符串）"),
    estimated_minutes: z.number().optional().describe("可选：预估时长（分钟）"),
    priority: z.number().optional().describe("可选：优先级（整数，越大越高）"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    const { text, link_record_id, ...schedule } = args;

    // 如果有关联记录，验证归属
    let recordId = link_record_id;
    if (recordId) {
      const rec = await recordRepo.findById(recordId);
      if (!rec) return { success: false, message: `关联记录 ${recordId} 不存在` };
      if (rec.device_id !== ctx.deviceId) return { success: false, message: "无权关联此记录" };
    } else {
      const rec = await recordRepo.create({
        device_id: ctx.deviceId,
        user_id: ctx.userId,
        status: "completed",
        source: "chat_tool",
      });
      recordId = rec.id;
    }

    const { todo, action } = await todoRepo.dedupCreate({
      record_id: recordId,
      text,
      done: false,
      user_id: ctx.userId,
      device_id: ctx.deviceId,
    });
    if (action === "matched") {
      return {
        success: true,
        message: `已有相似待办: "${todo.text}"，无需重复创建`,
        data: { todo_id: todo.id, record_id: recordId, deduplicated: true },
      };
    }

    // 异步写入 embedding
    void writeTodoEmbedding(todo.id, text, 0);

    // 更新可选的日程字段
    const updates: Record<string, any> = {};
    if (schedule.scheduled_start !== undefined) updates.scheduled_start = schedule.scheduled_start || null;
    if (schedule.scheduled_end !== undefined) updates.scheduled_end = schedule.scheduled_end || null;
    if (schedule.estimated_minutes !== undefined) updates.estimated_minutes = schedule.estimated_minutes;
    if (schedule.priority !== undefined) updates.priority = schedule.priority;
    if (Object.keys(updates).length > 0) {
      await todoRepo.update(todo.id, updates);
    }

    return {
      success: true,
      message: `已创建待办: "${text}"`,
      data: { todo_id: todo.id, record_id: recordId },
      next_hint: "如果待办需要关联到某个目标，可用 create_link",
    };
  },
};
