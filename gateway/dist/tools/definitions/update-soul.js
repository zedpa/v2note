import { z } from "zod";
import { chatCompletion } from "../../ai/provider.js";
import { soulRepo } from "../../db/repositories/index.js";
import { DEFAULT_SOUL } from "../../soul/default-soul.js";
export const updateSoulTool = {
    name: "update_soul",
    description: `更新 AI 的灵魂人格。
使用：用户直接对 AI 提出人格/风格要求（"你以后简洁点""你叫小跟班""别那么正经"）。
使用：AI 从长期互动中发现用户偏好某种风格，主动微调。
不用：用户在说自己或别人，不是在定义 AI。
不用：用户定义规则/流程/配置 → 用 update_user_agent。`,
    parameters: z.object({
        section: z.string().describe("要更新的 Soul 段落名（如'我的性格''我如何和你说话''我的禁忌'）"),
        content: z.string().describe("更新内容描述（AI 会合成到对应段落）"),
    }),
    autonomy: "silent",
    handler: async (args, ctx) => {
        if (!ctx.userId) {
            return { success: false, message: "需要登录" };
        }
        const existing = await soulRepo.findByUser(ctx.userId);
        const currentSoul = existing?.content ?? DEFAULT_SOUL;
        // AI 合成更新后的 Soul
        const result = await chatCompletion([
            {
                role: "system",
                content: `你负责维护 AI 的灵魂人格文档。基于现有人格和新的更新请求，合成更新后的完整人格文档。

规则：
- 只修改指定段落（${args.section}），保持其他段落不变
- 保持人格文档的整体风格和结构
- 用第一人称叙述
- 不要添加多余的解释，直接输出完整的更新后文档`,
            },
            {
                role: "user",
                content: `## 现有人格文档\n${currentSoul}\n\n## 更新请求\n段落：${args.section}\n内容：${args.content}`,
            },
        ], { temperature: 0.3, tier: "background" });
        await soulRepo.upsertByUser(ctx.userId, result.content, ctx.deviceId);
        return {
            success: true,
            message: `已更新人格段落: ${args.section}`,
        };
    },
};
//# sourceMappingURL=update-soul.js.map