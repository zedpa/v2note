import { z } from "zod";
import { notificationRepo } from "../../db/repositories/index.js";
import { today } from "../../lib/tz.js";
import { query } from "../../db/pool.js";
import type { ToolDefinition } from "../types.js";

/** 每用户每天主动通知上限（不含定时简报） */
const DAILY_LIMIT = 3;

export const sendNotificationTool: ToolDefinition = {
  name: "send_notification",
  description: `主动向用户发送通知。极度克制使用。
使用：用户设定的定时提醒到时间。
使用：用户长时间未互动 + 重要待办即将到期。
使用：重要日子（用户提过的纪念日等）。
不用：无聊或"想打招呼"。大多数情况不应调用此工具。`,
  parameters: z.object({
    title: z.string().describe("通知标题"),
    body: z.string().describe("通知正文（简短，1-2句话）"),
    action: z.enum(["chat", "todo", "diary"]).optional()
      .describe("点击后跳转：chat=对话，todo=待办，diary=日记"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    if (!ctx.userId) {
      return { success: false, message: "需要登录" };
    }

    // 频率限制：今日主动通知数
    const todayStr = today();
    const countResult = await query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM notification
       WHERE user_id = $1 AND type = 'ai_proactive'
         AND created_at::date = $2::date`,
      [ctx.userId, todayStr],
    );
    const todayCount = parseInt(countResult[0]?.cnt ?? "0", 10);

    if (todayCount >= DAILY_LIMIT) {
      return {
        success: false,
        message: `今日主动通知已达上限(${DAILY_LIMIT}条)，不再发送`,
      };
    }

    // 写入 notification 表（前端通过 WebSocket 推送给用户）
    await notificationRepo.create({
      deviceId: ctx.deviceId,
      userId: ctx.userId,
      type: "ai_proactive",
      title: args.title,
      body: args.body,
    });

    return {
      success: true,
      message: `已发送通知: ${args.title}`,
      data: { action: args.action ?? "chat" },
    };
  },
};
