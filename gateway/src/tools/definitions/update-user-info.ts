import { z } from "zod";
import { userProfileRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const updateUserInfoTool: ToolDefinition = {
  name: "update_user_info",
  description: `更新用户的个人画像信息。
使用：用户要求修改称呼、职业、关注重点等（"叫我小明"、"我换工作了"）。
使用：用户要调整偏好设置。
不用：AI 自动推断的用户画像更新（那由 profile manager 自动处理）。
不用：只需要查看画像 → 用 view(type:"profile")。`,
  parameters: z.object({
    name: z.string().optional().describe("用户称呼"),
    occupation: z.string().optional().describe("职业"),
    current_focus: z.string().optional().describe("当前关注的事"),
    pain_points: z.string().optional().describe("当前的困扰/痛点"),
    review_time: z.string().optional().describe("偏好的回顾时间（如 '21:00'）"),
    preferences: z.record(z.any()).optional().describe("偏好设置（JSON，合并更新）"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    if (!ctx.userId) {
      return { success: false, message: "登录已过期，请重新登录" };
    }

    const fields = ["name", "occupation", "current_focus", "pain_points", "review_time"] as const;
    const hasField = fields.some((f) => args[f] !== undefined);
    const hasPrefs = args.preferences !== undefined;

    if (!hasField && !hasPrefs) {
      return { success: false, message: "请至少指定一个要更新的字段" };
    }

    // 逐字段更新 onboarding 字段
    const updated: Record<string, string> = {};
    for (const field of fields) {
      if (args[field] !== undefined) {
        await userProfileRepo.upsertOnboardingField(
          ctx.userId, field, args[field], ctx.deviceId,
        );
        updated[field] = args[field];
      }
    }

    // 合并更新 preferences
    if (hasPrefs) {
      await userProfileRepo.upsertPreferences(ctx.userId, args.preferences!);
      updated.preferences = "已合并更新";
    }

    // 返回更新后的完整画像
    const profile = await userProfileRepo.findByUser(ctx.userId);

    return {
      success: true,
      message: `已更新: ${Object.keys(updated).join(", ")}`,
      data: {
        name: profile?.name ?? null,
        occupation: profile?.occupation ?? null,
        current_focus: profile?.current_focus ?? null,
        pain_points: profile?.pain_points ?? null,
        review_time: profile?.review_time ?? null,
        preferences: profile?.preferences ?? {},
        onboarding_done: profile?.onboarding_done ?? false,
      },
    };
  },
};
