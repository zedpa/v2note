import { z } from "zod";
import { goalRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const updateGoalTool: ToolDefinition = {
  name: "update_goal",
  description: `更新目标——修改标题、状态（完成/搁置/重新激活）。
使用：用户要修改目标（"这个目标完成了"、"先搁置"、"改一下标题"）。
不用：用户要删除目标 → 目前不支持删除目标，建议搁置（archived）。
不用：用户要创建新目标 → 用 create_goal。`,
  parameters: z.object({
    goal_id: z.string().min(1).describe("目标 ID"),
    title: z.string().optional().describe("可选：新标题"),
    status: z.enum(["active", "paused", "completed", "abandoned"]).optional()
      .describe("可选：active=激活, paused=暂停, completed=完成, abandoned=放弃"),
  }),
  autonomy: "confirm",
  handler: async (args, ctx) => {
    const { goal_id, ...fields } = args;

    const updates: Record<string, any> = {};
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.status !== undefined) updates.status = fields.status;

    if (Object.keys(updates).length === 0) {
      return { success: false, message: "没有提供需要更新的字段" };
    }

    await goalRepo.update(goal_id, updates);

    const statusLabels: Record<string, string> = { completed: "已完成", paused: "已暂停", abandoned: "已放弃", active: "已重新激活" };
    const statusMsg = fields.status ? statusLabels[fields.status] ?? "已更新" : "已更新";

    return {
      success: true,
      message: `目标${statusMsg} (ID: ${goal_id})`,
      data: { goal_id, ...updates },
    };
  },
};
