import { z } from "zod";
import { todoRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const deleteTodoTool: ToolDefinition = {
  name: "delete_todo",
  description: `删除（取消）待办事项。路路会先确认再执行。
使用：用户明确要取消/删除某个待办（"取消那个会议"、"删掉买菜"）。
不用：用户要标记完成 → 用 update_todo { done: true }。
不用：用户要修改内容 → 用 update_todo。`,
  parameters: z.object({
    todo_id: z.string().min(1).describe("要删除的待办事项 ID"),
    reason: z.string().optional().describe("可选：删除原因，用于回复措辞"),
  }),
  autonomy: "confirm",
  handler: async (args, _ctx) => {
    const { todo_id } = args;

    const todo = await todoRepo.findById(todo_id);
    if (!todo) return { success: false, message: `待办 ${todo_id} 不存在` };

    // 软删除：标记 done=true，保留数据
    await todoRepo.update(todo_id, { done: true });

    return {
      success: true,
      message: `已取消待办「${todo.text?.slice(0, 30) ?? todo_id}」`,
      data: { todo_id, text: todo.text },
    };
  },
};
