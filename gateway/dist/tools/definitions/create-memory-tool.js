import { z } from "zod";
import { saveMemory } from "../../memory/long-term.js";
import * as memoryRepo from "../../db/repositories/memory.js";
import { today } from "../../lib/tz.js";
/** 每用户记忆上限 */
const MAX_MEMORIES_PER_USER = 500;
export const createMemoryTool = {
    name: "create_memory",
    description: `记录一条有时间属性的用户信息到长期记忆。
使用：用户提到了观点、决定、临时状态、承诺、情绪等有时间属性的信息。
不用：持久身份信息（职业、关系）→ 用 update_profile。
不用：AI 人格定义 → 用 update_soul。
不用：用户规则/配置 → 用 update_user_agent。`,
    parameters: z.object({
        content: z.string().describe("记忆内容（简洁摘要）"),
        importance: z.number().min(1).max(10).default(5)
            .describe("重要性：1-3 一般事实，4-6 较重要，7-8 重要事件，9-10 核心目标/重大事件"),
    }),
    autonomy: "silent",
    handler: async (args, ctx) => {
        if (!ctx.userId) {
            return { success: false, message: "需要登录" };
        }
        // 上限淘汰
        const count = await memoryRepo.countByUser(ctx.userId);
        if (count >= MAX_MEMORIES_PER_USER) {
            const evictCount = count - MAX_MEMORIES_PER_USER + 1;
            await memoryRepo.evictLeastImportant(ctx.userId, evictCount);
        }
        await saveMemory(ctx.deviceId, args.content, today(), args.importance, ctx.userId);
        return {
            success: true,
            message: `已记录: ${args.content.slice(0, 50)}`,
        };
    },
};
//# sourceMappingURL=create-memory-tool.js.map