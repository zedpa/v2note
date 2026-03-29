import { z } from "zod";
import { recordRepo, transcriptRepo, summaryRepo } from "../../db/repositories/index.js";
export const createRecordTool = {
    name: "create_record",
    description: `创建一条日记/笔记。
使用：用户要求记录内容（"帮我记下"、"写一条日记"、"记录一下"）。
不用：用户提到具体要做的事 → 用 create_todo。
不用：用户要设定目标 → 用 create_goal。`,
    parameters: z.object({
        content: z.string().min(1).describe("日记正文内容"),
        title: z.string().max(50).optional().describe("标题（可选，不超过50字）"),
    }),
    autonomy: "notify",
    handler: async (args, ctx) => {
        const { content, title } = args;
        const record = await recordRepo.create({
            device_id: ctx.deviceId,
            user_id: ctx.userId,
            status: "completed",
            source: "chat_tool",
        });
        await transcriptRepo.create({
            record_id: record.id,
            text: content,
            language: "zh",
        });
        await summaryRepo.create({
            record_id: record.id,
            title: title ?? content.slice(0, 50),
            short_summary: content,
        });
        return {
            success: true,
            message: `日记已创建: "${(title ?? content).slice(0, 30)}"`,
            data: { record_id: record.id, title: title ?? content.slice(0, 50) },
            next_hint: "如果这条日记和某个目标相关，可用 create_link 关联",
        };
    },
};
//# sourceMappingURL=create-record.js.map