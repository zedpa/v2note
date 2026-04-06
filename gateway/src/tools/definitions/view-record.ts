import { z } from "zod";
import { recordRepo, transcriptRepo, summaryRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

const MAX_CONTENT_LENGTH = 5000;

export const viewRecordTool: ToolDefinition = {
  name: "view_record",
  description: `查看一条日记/笔记的完整内容。
使用：用户要看某条日记的详情（"帮我看看那条日记"、"那条笔记写了什么"）。
使用：需要分析或总结某条日记内容时。
不用：只需要知道有没有某条日记 → 用 search。
不用：要查看待办或目标 → 用 view_todo / view_goal。`,
  parameters: z.object({
    record_id: z.string().min(1).describe("日记/笔记 ID"),
  }),
  autonomy: "silent",
  handler: async (args, ctx) => {
    const record = await recordRepo.findById(args.record_id);
    if (!record) {
      return { success: false, message: "日记不存在或无权访问" };
    }
    // 归属校验：userId 或 deviceId 匹配
    if (record.user_id !== ctx.userId && record.device_id !== ctx.deviceId) {
      return { success: false, message: "日记不存在或无权访问" };
    }

    // 获取内容
    const [transcript, summary] = await Promise.all([
      transcriptRepo.findByRecordId(args.record_id),
      summaryRepo.findByRecordId(args.record_id),
    ]);

    const fullContent = transcript?.text ?? "";
    const truncated = fullContent.length > MAX_CONTENT_LENGTH;
    const content = truncated
      ? fullContent.slice(0, MAX_CONTENT_LENGTH)
      : fullContent;

    return {
      success: true,
      message: truncated
        ? `日记内容已截断，共 ${fullContent.length} 字`
        : `日记内容，共 ${fullContent.length} 字`,
      data: {
        record_id: record.id,
        title: summary?.title ?? null,
        content,
        domain: record.domain ?? null,
        source: record.source,
        created_at: record.created_at,
        word_count: fullContent.length,
        truncated,
      },
    };
  },
};
