import { z } from "zod";
import { goalRepo } from "../../db/repositories/index.js";
export const createGoalTool = {
    name: "create_goal",
    description: `创建一个目标。创建目标是重大决策，路路会先确认再执行。
使用：用户明确表达目标意图（"我的目标是"、"我想要达成"、"把xxx作为目标"）。
不用：用户提到一个具体的待办事项 → 用 create_todo。
不用：用户只是在讨论想法，还没确认为目标 → 继续对话。`,
    parameters: z.object({
        title: z.string().min(1).describe("目标标题"),
        parent_id: z.string().optional().describe("父目标ID（可选，用于子目标）"),
    }),
    autonomy: "confirm",
    handler: async (args, ctx) => {
        const { title, parent_id } = args;
        const goal = await goalRepo.create({
            device_id: ctx.deviceId,
            user_id: ctx.userId,
            title,
            parent_id,
            source: "chat",
        });
        return {
            success: true,
            message: `目标已创建: "${title}"`,
            data: { goal_id: goal.id },
            next_hint: "可以用 search 查找相关日记，然后用 create_link 关联",
        };
    },
};
//# sourceMappingURL=create-goal.js.map