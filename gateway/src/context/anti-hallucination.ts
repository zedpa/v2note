/**
 * Anti-hallucination guardrails injected into the hot tier.
 * These rules sit near the top of the system prompt for maximum attention.
 *
 * Inspired by OpenClaw's evidence-based discipline:
 * - Never claim an action was done unless tool actually ran
 * - Every output must have evidence in the source
 */

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
