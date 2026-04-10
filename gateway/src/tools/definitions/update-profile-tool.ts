import { z } from "zod";
import { chatCompletion } from "../../ai/provider.js";
import { userProfileRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const updateProfileTool: ToolDefinition = {
  name: "update_profile",
  description: `更新用户画像（持久性身份信息）。
使用：用户透露了职业变动、重要关系、居住地等持久性事实。
不用：临时状态（出差、旅行）→ 用 create_memory。
不用：AI 的人格/风格 → 用 update_soul。
不用：用户的规则/流程 → 用 update_user_agent。`,
  parameters: z.object({
    facts: z.string().describe("提取的用户事实（如'用户是产品经理，在XXX公司'）"),
  }),
  autonomy: "silent",
  handler: async (args, ctx) => {
    if (!ctx.userId) {
      return { success: false, message: "需要登录" };
    }

    const existing = await userProfileRepo.findByUser(ctx.userId);
    const currentProfile = existing?.content ?? "";

    const result = await chatCompletion(
      [
        {
          role: "system",
          content: `你负责维护用户画像。基于现有画像和新的事实信息，合成更新后的完整用户画像。

用户画像应包含：职业/角色、重要关系、能力/知识领域、兴趣/习惯、生活环境
不应包含：临时状态、观点/态度、情绪状态、AI 的属性

用 markdown 格式，分类清晰。只输出更新后的完整用户画像。保持简洁。`,
        },
        {
          role: "user",
          content: `## 现有画像\n${currentProfile || "（空白）"}\n\n## 新的事实\n${args.facts}`,
        },
      ],
      { temperature: 0.3, tier: "background" },
    );

    await userProfileRepo.upsertByUser(ctx.userId, result.content, ctx.deviceId);

    return {
      success: true,
      message: `已更新用户画像`,
    };
  },
};
