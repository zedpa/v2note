import type { Skill } from "./types.js";
import type { AgentRole } from "../context/tiers.js";
/**
 * Build the system prompt.
 *
 * 组装顺序（按意义优先级）：
 * 1. SharedAgent — 系统基座（安全规则 + 工具规则 + 自我维护说明）
 * 2. Agent prompt — briefing/onboarding 角色化（chat 已由 Soul 替代）
 * 3. 时间锚点
 * 4. Soul — AI 的灵魂人格
 * 5. UserAgent — 用户的规则/配置
 * 6. Profile — 用户画像
 * 7. Memory — 相关记忆
 * 8. Wiki — 相关知识
 * 9. 认知上下文 — 用户思考动态
 * 10. 待确认意图
 * 11. 技能
 * 12. MCP 工具
 */
export declare function buildSystemPrompt(opts: {
    skills: Skill[];
    soul?: string;
    userAgent?: string;
    userProfile?: string;
    memory?: string[];
    wikiContext?: string[];
    mode?: "chat" | "briefing";
    /** briefing/onboarding 保留，chat 不再传 */
    agent?: AgentRole;
    mcpTools?: Array<{
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    }>;
    pendingIntentContext?: string;
    cognitiveContext?: string;
}): string;
