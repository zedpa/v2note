/**
 * Anti-hallucination guardrails injected into the hot tier.
 * These rules sit near the top of the system prompt for maximum attention.
 *
 * Inspired by OpenClaw's evidence-based discipline:
 * - Never claim an action was done unless tool actually ran
 * - Every output must have evidence in the source
 */
/** Rules for process mode (structured extraction) */
export const PROCESS_GUARDRAILS = `## 提取纪律（必须遵守）
- 只提取用户明确说出的内容，不要推测、补充或"合理推断"
- 如果信息不足以判断，返回空数组，不要猜测
- 不要将记忆中的内容混入当前记录的提取结果
- 记忆仅供理解用户背景，不作为提取来源
- 每条提取结果必须能在原文中找到对应的原句`;
/** Rules for chat mode (conversation) */
export const CHAT_GUARDRAILS = `## 对话纪律
- 不确定的事情明确说"我不确定"
- 不要编造用户没说过的事实
- 引用记忆时标注来源日期
- 区分"用户说过"和"我推测"`;
/** Rules for briefing mode */
export const BRIEFING_GUARDRAILS = `## 简报纪律
- 只基于实际的待办和记录数据生成简报
- 不要虚构统计数字或完成情况
- 明确区分已确认事实和AI建议`;
//# sourceMappingURL=anti-hallucination.js.map