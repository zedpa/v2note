import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDateAnchor } from "../lib/date-anchor.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, "../../agents");
// Load base constitution once at startup — AI 行为宪法（共享基座）
let baseMd;
try {
    baseMd = readFileSync(join(__dirname, "../../AGENTS.md"), "utf-8");
}
catch {
    baseMd = "你是一个智能笔记助手，帮助用户整理和回顾语音/文字记录。";
}
// Load agent-specific prompts at startup（角色化 Agent）
const agentFileMap = {
    chat: "chat.md",
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
 * Build tiered context for chat/briefing prompt assembly.
 *
 * Hot tier (~1500 chars): core rules, anti-hallucination
 * Warm tier (variable): soul, profile, memories, skill prompts, tools
 */
export function buildTieredContext(opts) {
    const hot = [];
    const warm = [];
    // ── HOT TIER: base constitution (AGENTS.md 共享基座) ──
    hot.push(baseMd);
    // ── HOT TIER: agent-specific prompt (角色化 Agent) ──
    if (opts.agent && agentPrompts[opts.agent]) {
        hot.push(agentPrompts[opts.agent]);
    }
    // ── HOT TIER: 时间锚点（让 AI 调用 create_todo 时知道今天日期）──
    hot.push(buildDateAnchor());
    // ── WARM TIER: task-specific ──
    // Soul
    if (opts.soul) {
        warm.push(`## AI 身份\n${opts.soul}`);
    }
    // User profile
    if (opts.userProfile) {
        warm.push(`## 用户画像\n${opts.userProfile}`);
    }
    // Memories
    if (opts.memories && opts.memories.length > 0) {
        warm.push(`## 相关记忆\n${opts.memories.join("\n")}`);
    }
    // Active skill full prompts
    if (opts.skills.length > 0) {
        warm.push(`## 激活的技能`);
        for (const skill of opts.skills) {
            warm.push(`\n### ${skill.name}\n${skill.prompt}`);
        }
    }
    // Tools — 工具通过 Vercel AI SDK 原生 function calling 注入，
    // 不再在 system prompt 中注入工具列表和调用规则。
    // MCP 外部工具仍通过描述注入（兼容性保留）
    if (opts.mcpTools && opts.mcpTools.length > 0) {
        warm.push(`## 外部工具（MCP）`);
        for (const tool of opts.mcpTools) {
            warm.push(`\n### ${tool.name}\n${tool.description}`);
        }
    }
    return {
        hot: hot.join("\n"),
        warm: warm.join("\n"),
    };
}
/**
 * Build the system prompt by combining hot + warm tiers.
 * Serves chat and briefing modes only (process uses hardcoded prompt).
 */
export function buildSystemPrompt(opts) {
    const tiered = buildTieredContext({
        mode: opts.mode ?? "chat",
        skills: opts.skills,
        soul: opts.soul,
        userProfile: opts.userProfile,
        memories: opts.memory,
        mcpTools: opts.mcpTools,
        agent: opts.agent,
    });
    const parts = [tiered.hot, tiered.warm];
    if (opts.cognitiveContext) {
        parts.push(`## 用户思考动态\n${opts.cognitiveContext}\n在对话中自然提及这些变化和演进，用"变化""演进""不同角度"等温和措辞。不要使用"矛盾""聚类""Strike"等技术术语。`);
    }
    if (opts.pendingIntentContext) {
        parts.push(opts.pendingIntentContext);
    }
    return parts.filter(Boolean).join("\n");
}
//# sourceMappingURL=prompt-builder.js.map