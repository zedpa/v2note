import { z } from "zod";
import { recordRepo, transcriptRepo, summaryRepo } from "../../db/repositories/index.js";
/**
 * save_conversation — 将对话中的内容保存为日记
 *
 * 解决 create_record 的"长内容复制"问题：
 * 当 AI 生成了报告/分析等长文本后，用户要求保存为日记，
 * AI 无需在 tool call 中重新输出全部内容（可能因 output token 限制截断），
 * 而是调用此工具，由工具从对话历史中提取最近的 assistant 消息内容。
 */
export const saveConversationTool = {
    name: "save_conversation",
    description: `将当前对话中的内容保存为日记。从最近的 AI 回复中提取内容，无需重新输入。
使用：用户要求将刚才的对话内容、报告、分析结果保存为日记（"把这个写成日记"、"保存为笔记"、"帮我记下来"）。
使用：AI 生成了长篇报告/分析后，用户要保存。
不用：用户给出新的内容让你记录 → 用 create_record。
不用：对话还没产生值得保存的内容。`,
    parameters: z.object({
        title: z.string().max(100).optional().describe("日记标题（可选，AI 自动生成）"),
        message_count: z.number().int().min(1).max(10).optional()
            .describe("保存最近几条 AI 回复（默认 1，即最近一条）"),
    }),
    autonomy: "notify",
    handler: async (args, ctx) => {
        if (!ctx.getMessages) {
            return { success: false, message: "无法访问对话历史" };
        }
        const messages = ctx.getMessages();
        const count = args.message_count ?? 1;
        // 从对话历史中提取最近的 assistant 消息
        const assistantMessages = messages
            .filter((m) => m.role === "assistant" && m.content.trim())
            .slice(-count);
        if (assistantMessages.length === 0) {
            return { success: false, message: "对话中没有可保存的内容" };
        }
        const content = assistantMessages.map((m) => m.content).join("\n\n---\n\n");
        if (!content.trim()) {
            return { success: false, message: "对话内容为空" };
        }
        // 自动生成标题（取前50字）
        const title = args.title ?? content.replace(/[#*\->\n]/g, "").trim().slice(0, 50);
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
            title,
            short_summary: content,
        });
        // 标记为已消化，避免 digest 管道重新处理
        await recordRepo.markDigested(record.id);
        return {
            success: true,
            message: `已将对话内容保存为日记: "${title.slice(0, 30)}"`,
            data: {
                record_id: record.id,
                title,
                word_count: content.length,
                source_messages: assistantMessages.length,
            },
        };
    },
};
//# sourceMappingURL=save-conversation.js.map