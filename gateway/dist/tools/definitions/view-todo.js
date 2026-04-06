import { z } from "zod";
import { todoRepo } from "../../db/repositories/index.js";
export const viewTodoTool = {
    name: "view_todo",
    description: `查看一条待办的完整详情。
使用：用户问某个待办的具体信息（"这个待办什么时候的"、"帮我看看这个任务的子任务"）。
使用：更新待办前需要了解当前状态。
不用：只需要列出待办列表 → 用 search(scope:"todos")。`,
    parameters: z.object({
        todo_id: z.string().min(1).describe("待办 ID"),
    }),
    autonomy: "silent",
    handler: async (args, ctx) => {
        const todo = await todoRepo.findById(args.todo_id);
        if (!todo) {
            return { success: false, message: "待办不存在或无权访问" };
        }
        // 归属校验
        if (todo.user_id !== ctx.userId && todo.device_id !== ctx.deviceId) {
            return { success: false, message: "待办不存在或无权访问" };
        }
        // 查询子任务
        const subtasks = await todoRepo.findSubtasks(args.todo_id);
        return {
            success: true,
            message: `待办: "${todo.text}"`,
            data: {
                todo_id: todo.id,
                text: todo.text,
                done: todo.done,
                priority: todo.priority,
                scheduled_start: todo.scheduled_start,
                scheduled_end: todo.scheduled_end,
                estimated_minutes: todo.estimated_minutes,
                parent_id: todo.parent_id,
                record_id: todo.record_id,
                subtasks: subtasks.map((s) => ({
                    id: s.id,
                    text: s.text,
                    done: s.done,
                })),
                created_at: todo.created_at,
            },
        };
    },
};
//# sourceMappingURL=view-todo.js.map