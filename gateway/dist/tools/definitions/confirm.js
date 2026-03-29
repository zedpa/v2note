import { z } from "zod";
import { pendingIntentRepo, goalRepo, recordRepo, todoRepo } from "../../db/repositories/index.js";
export const confirmTool = {
    name: "confirm",
    description: `确认或处理待确认的意图/操作。
使用：用户对之前提到的愿望/目标做出明确回应时。
使用：Plan 机制中需要用户确认的步骤。
不用：日常对话确认（"是的"、"对"） → 正常对话处理。`,
    parameters: z.object({
        intent_id: z.string().min(1).describe("待确认意图/Plan 的 ID"),
        action: z.enum(["promote_goal", "promote_todo", "dismiss"])
            .describe("处理动作：promote_goal=升级为目标, promote_todo=转为待办, dismiss=忽略"),
    }),
    autonomy: "notify",
    handler: async (args, ctx) => {
        const { intent_id, action } = args;
        const intent = await pendingIntentRepo.findById(intent_id);
        if (!intent)
            return { success: false, message: `意图 ${intent_id} 不存在` };
        if (intent.device_id !== ctx.deviceId)
            return { success: false, message: "无权操作此意图" };
        if (action === "promote_goal") {
            const goal = await goalRepo.create({
                device_id: ctx.deviceId,
                user_id: ctx.userId,
                title: intent.text,
                source: "speech",
            });
            await pendingIntentRepo.updateStatus(intent_id, "promoted", goal.id);
            return {
                success: true,
                message: `已将「${intent.text}」确认为目标`,
                data: { goal_id: goal.id },
            };
        }
        if (action === "promote_todo") {
            const record = await recordRepo.create({
                device_id: ctx.deviceId,
                user_id: ctx.userId,
                status: "completed",
                source: "chat_tool",
            });
            const todo = await todoRepo.create({
                record_id: record.id,
                text: intent.text,
                done: false,
            });
            await pendingIntentRepo.updateStatus(intent_id, "promoted", todo.id);
            return {
                success: true,
                message: `已将「${intent.text}」转为待办`,
                data: { todo_id: todo.id },
            };
        }
        // dismiss
        await pendingIntentRepo.updateStatus(intent_id, "dismissed");
        return {
            success: true,
            message: `已忽略「${intent.text}」`,
        };
    },
};
//# sourceMappingURL=confirm.js.map