import { z } from "zod";
import { userAgentRepo } from "../../db/repositories/index.js";
import { chatCompletion } from "../../ai/provider.js";
import type { ToolDefinition } from "../types.js";

const VALID_SECTIONS = ["我的规则", "我的流程偏好", "技能配置", "通知偏好"] as const;

/** 规则膨胀上限 */
const MAX_RULES_PER_SECTION = 20;
const COMPACT_TARGET = 15;

export const updateUserAgentTool: ToolDefinition = {
  name: "update_user_agent",
  description: `更新用户的个性化规则/配置。
使用：用户明确定义了规则、流程偏好、技能配置、通知偏好。
  - "以后记账标金额" → section: "我的规则"
  - "别每天给我发简报" → section: "通知偏好"
  - "帮我开启芒格复盘" → section: "技能配置"
  - "复盘用芒格视角" → section: "技能配置"
不用：AI 人格/风格相关 → 用 update_soul。`,
  parameters: z.object({
    section: z.enum(VALID_SECTIONS).describe("要更新的段落"),
    rule: z.string().describe("新增或修改的规则"),
  }),
  autonomy: "silent",
  handler: async (args, ctx) => {
    if (!ctx.userId) {
      return { success: false, message: "需要登录" };
    }

    const ua = await userAgentRepo.findOrCreate(ctx.userId);
    let content = ua.content;

    // 找到对应段落并追加规则
    const sectionHeader = `## ${args.section}`;
    const sectionIdx = content.indexOf(sectionHeader);

    if (sectionIdx === -1) {
      // 段落不存在，追加
      content += `\n\n${sectionHeader}\n- ${args.rule}`;
    } else {
      // 找到下一个 ## 或文件末尾
      const nextSectionIdx = content.indexOf("\n## ", sectionIdx + sectionHeader.length);
      const insertPos = nextSectionIdx === -1 ? content.length : nextSectionIdx;
      content = content.slice(0, insertPos) + `\n- ${args.rule}` + content.slice(insertPos);
    }

    // 检查规则膨胀
    const sectionStart = content.indexOf(sectionHeader);
    if (sectionStart !== -1) {
      const nextSection = content.indexOf("\n## ", sectionStart + sectionHeader.length);
      const sectionContent = nextSection === -1
        ? content.slice(sectionStart)
        : content.slice(sectionStart, nextSection);
      const ruleCount = (sectionContent.match(/^- /gm) || []).length;

      if (ruleCount > MAX_RULES_PER_SECTION) {
        // AI 合成精简
        const compactResult = await chatCompletion(
          [
            {
              role: "system",
              content: `精简以下规则列表，合并相似规则、移除过时规则，保留不超过 ${COMPACT_TARGET} 条最重要的规则。每条以"- "开头。只输出精简后的规则列表，不要加标题。`,
            },
            { role: "user", content: sectionContent },
          ],
          { temperature: 0.3, tier: "background" },
        );

        const compacted = `${sectionHeader}\n${compactResult.content.trim()}`;
        content = nextSection === -1
          ? content.slice(0, sectionStart) + compacted
          : content.slice(0, sectionStart) + compacted + content.slice(nextSection);
      }
    }

    await userAgentRepo.updateContent(ctx.userId, content);

    return {
      success: true,
      message: `已更新「${args.section}」: ${args.rule}`,
    };
  },
};
