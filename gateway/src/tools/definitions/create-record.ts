import { z } from "zod";
import { recordRepo, transcriptRepo, summaryRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const createRecordTool: ToolDefinition = {
  name: "create_record",
  description: `创建一条日记/笔记。
使用：用户**明确要求**记录内容（"帮我记下"、"写一条日记"、"记录一下"）。
不用：用户提到具体要做的事 → 用 create_todo。
不用：用户要设定目标 → 用 create_goal。
不用：用户只是在聊天、闲聊、开玩笑、确认("ok"/"好的"/"嗯") → 绝对不调用此工具。
不用：用户在告诉你关于自己的信息（昵称、偏好等）→ 这是画像/记忆，不是日记。`,
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
      short_summary: content.slice(0, 200),
    });

    // 标记为已消化，避免 digest 管道重新处理（工具创建的记录已有完整 summary）
    await recordRepo.markDigested(record.id);

    return {
      success: true,
      message: `日记已创建: "${(title ?? content).slice(0, 30)}"`,
      data: { record_id: record.id, title: title ?? content.slice(0, 50) },
      next_hint: "如果这条日记和某个目标相关，可用 create_link 关联",
    };
  },
};
