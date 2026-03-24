import { z } from "zod";
import { bondRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const createLinkTool: ToolDefinition = {
  name: "create_link",
  description: `在两个实体之间建立关联（日记↔目标、日记↔日记、目标↔目标）。
使用：用户要关联两条内容（"把这个和那个目标关联"、"建立关系"）。
使用：创建待办/目标后需要关联到已有内容时。
不用：AI 自动发现的语义关联 → 由 Digest 管道自动处理。`,
  parameters: z.object({
    source_id: z.string().min(1).describe("来源实体 ID（record/goal/strike）"),
    target_id: z.string().min(1).describe("目标实体 ID（record/goal/strike）"),
    link_type: z.enum(["related", "supports", "blocks"]).default("related")
      .describe("关联类型：related=相关, supports=支持, blocks=阻碍"),
  }),
  autonomy: "notify",
  handler: async (args, ctx) => {
    const { source_id, target_id, link_type } = args;

    // 创建 Bond（复用认知层的关联机制）
    await bondRepo.create({
      source_strike_id: source_id,
      target_strike_id: target_id,
      type: `user_${link_type}`,
      strength: 1.0,
    });

    return {
      success: true,
      message: `已建立关联: ${source_id} → ${target_id} (${link_type})`,
      data: { source_id, target_id, link_type },
    };
  },
};
