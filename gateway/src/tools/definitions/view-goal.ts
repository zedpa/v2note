import { z } from "zod";
import { goalRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

const MAX_SUB_GOALS = 20;

export const viewGoalTool: ToolDefinition = {
  name: "view_goal",
  description: `查看一个目标的完整详情。
使用：用户问某个目标的进展（"这个目标进展如何"、"有哪些子目标"）。
使用：更新目标前需要了解当前状态。
不用：只需要列出目标列表 → 用 search(scope:"goals")。`,
  parameters: z.object({
    goal_id: z.string().min(1).describe("目标 ID"),
  }),
  autonomy: "silent",
  handler: async (args, ctx) => {
    const goal = await goalRepo.findById(args.goal_id);
    if (!goal) {
      return { success: false, message: "目标不存在或无权访问" };
    }
    // 归属校验
    if (goal.user_id !== ctx.userId && goal.device_id !== ctx.deviceId) {
      return { success: false, message: "目标不存在或无权访问" };
    }

    // 查询关联待办
    const todos = await goalRepo.findWithTodos(args.goal_id);
    const activeTodos = todos.filter((t) => !t.done);
    const completedTodos = todos.filter((t) => t.done);

    return {
      success: true,
      message: `目标: "${goal.title}"`,
      data: {
        goal_id: goal.id,
        title: goal.title,
        status: goal.status,
        parent_id: goal.parent_id,
        source: goal.source,
        todo_stats: {
          active: activeTodos.length,
          completed: completedTodos.length,
        },
        todos: todos.slice(0, MAX_SUB_GOALS).map((t) => ({
          id: t.id,
          text: t.text,
          done: t.done,
        })),
        created_at: goal.created_at,
      },
    };
  },
};
