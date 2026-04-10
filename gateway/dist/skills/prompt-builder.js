import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDateAnchor } from "../lib/date-anchor.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, "../../agents");
// SharedAgent: 全局共享基座，启动时加载常驻内存
let sharedAgentMd;
try {
    sharedAgentMd = readFileSync(join(__dirname, "../../SHARED_AGENT.md"), "utf-8");
    console.log("[prompt-builder] SHARED_AGENT.md loaded");
}
catch {
    // 回退到旧 AGENTS.md（过渡期）
    try {
        sharedAgentMd = readFileSync(join(__dirname, "../../AGENTS.md"), "utf-8");
        console.log("[prompt-builder] Fallback to AGENTS.md");
    }
    catch {
        sharedAgentMd = "你是一个智能笔记助手，帮助用户整理和回顾语音/文字记录。";
    }
}
// 角色化 Agent — briefing/onboarding 保留，chat 已由 Soul 替代
const agentFileMap = {
    briefing: "briefing.md",
    onboarding: "onboarding.md",
};
const agentPrompts = {};
for (const [role, filename] of Object.entries(agentFileMap)) {
    const filePath = join(AGENTS_DIR, filename);
    if (existsSync(filePath)) {
        try {
            agentPrompts[role] = readFileSync(filePath, "utf-8");
            console.log(`[prompt-builder] Agent loaded: ${filename}`);
        }
        catch {
            console.warn(`[prompt-builder] Failed to load agent: ${filename}`);
        }
    }
}
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
export function buildSystemPrompt(opts) {
    const parts = [];
    // 1. SharedAgent 基座
    parts.push(sharedAgentMd);
    // 2. Agent prompt（briefing/onboarding）
    if (opts.agent && agentPrompts[opts.agent]) {
        parts.push(agentPrompts[opts.agent]);
    }
    // 3. 时间锚点
    parts.push(buildDateAnchor());
    // 4. Soul — AI 灵魂人格
    if (opts.soul) {
        parts.push(`## 灵魂\n${opts.soul}`);
    }
    // 5. UserAgent — 用户规则/配置
    if (opts.userAgent) {
        parts.push(`## 用户规则\n${opts.userAgent}`);
    }
    // 6. Profile — 用户画像
    if (opts.userProfile) {
        parts.push(`## 用户画像\n${opts.userProfile}`);
    }
    // 7. Memory — 相关记忆
    if (opts.memory && opts.memory.length > 0) {
        parts.push(`## 相关记忆\n${opts.memory.join("\n")}`);
    }
    // 8. Wiki — 相关知识
    if (opts.wikiContext && opts.wikiContext.length > 0) {
        parts.push(`## 相关知识\n${opts.wikiContext.map(w => `- ${w}`).join("\n")}`);
    }
    // 9. 认知上下文
    if (opts.cognitiveContext) {
        parts.push(`## 用户思考动态\n${opts.cognitiveContext}\n在对话中自然提及这些变化和演进，用"变化""演进""不同角度"等温和措辞。不要使用"矛盾""聚类""Strike"等技术术语。`);
    }
    // 10. 待确认意图
    if (opts.pendingIntentContext) {
        parts.push(opts.pendingIntentContext);
    }
    // 11. 技能
    if (opts.skills.length > 0) {
        parts.push(`## 激活的技能`);
        for (const skill of opts.skills) {
            parts.push(`\n### ${skill.name}\n${skill.prompt}`);
        }
    }
    // 12. MCP 外部工具
    if (opts.mcpTools && opts.mcpTools.length > 0) {
        parts.push(`## 外部工具（MCP）`);
        for (const tool of opts.mcpTools) {
            parts.push(`\n### ${tool.name}\n${tool.description}`);
        }
    }
    return parts.filter(Boolean).join("\n");
}
//# sourceMappingURL=prompt-builder.js.map