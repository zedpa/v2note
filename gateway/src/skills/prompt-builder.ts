import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill } from "./types.js";
import { BUILTIN_TOOLS } from "../tools/builtin.js";
import type { ContextTier, ContextBuildOptions } from "../context/tiers.js";
import {
  CHAT_GUARDRAILS,
  BRIEFING_GUARDRAILS,
} from "../context/anti-hallucination.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Agent.md once at startup — compact version for hot tier
let agentMdCore: string;
try {
  const agentMdFull = readFileSync(join(__dirname, "../../Agent.md"), "utf-8");
  const commandTableIdx = agentMdFull.indexOf("## 指令模式");
  agentMdCore = commandTableIdx > 0
    ? agentMdFull.slice(0, commandTableIdx).trim()
    : agentMdFull;
} catch {
  agentMdCore = "你是一个智能笔记助手，帮助用户整理和回顾语音/文字记录。";
}

/**
 * Build tiered context for chat/briefing prompt assembly.
 *
 * Hot tier (~1500 chars): core rules, anti-hallucination
 * Warm tier (variable): soul, profile, memories, skill prompts, tools
 */
export function buildTieredContext(opts: ContextBuildOptions): ContextTier {
  const hot: string[] = [];
  const warm: string[] = [];

  // ── HOT TIER: always present ──

  hot.push(agentMdCore);

  if (opts.mode === "chat") {
    hot.push(`\n${CHAT_GUARDRAILS}`);
    hot.push(`\n## 任务\n你正在与用户进行复盘对话。基于记忆和用户画像，帮助用户回顾和总结。自然地对话，按需提出问题和洞察。`);
  } else if (opts.mode === "briefing") {
    hot.push(`\n${BRIEFING_GUARDRAILS}`);
  }

  // ── WARM TIER: task-specific ──

  // Soul
  if (opts.soul) {
    warm.push(`## AI 人格定义\n${opts.soul}`);
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

  // Tools
  const allTools = [
    ...BUILTIN_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    ...(opts.mcpTools ?? []),
  ];
  if (allTools.length > 0) {
    warm.push(`## 可用工具\n你可以调用以下工具来执行操作。`);
    for (const tool of allTools) {
      warm.push(`\n### ${tool.name}\n${tool.description}`);
    }

    warm.push(`\n## 工具调用规则（重要）
当你需要调用工具时，你的**整条回复**必须是且仅是一个 JSON 对象，不要包含任何其他文字。格式：
{"tool_calls": [{"name": "工具名", "arguments": {...}}]}

错误示范（不要这样做）：
好的，我来帮你记录。{"tool_calls": [...]}

正确示范：
{"tool_calls": [{"name": "create_diary", "arguments": {"content": "明天开会", "title": "开会"}}]}

工具执行后系统会自动把结果告诉你，届时你再用自然语言回复用户。
如果不需要调用工具，正常用自然语言回复即可。`);
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
export function buildSystemPrompt(opts: {
  skills: Skill[];
  soul?: string;
  userProfile?: string;
  memory?: string[];
  mode?: "chat" | "briefing";
  mcpTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  /** Pre-built pending intent context to inject into warm tier */
  pendingIntentContext?: string;
}): string {
  const tiered = buildTieredContext({
    mode: opts.mode ?? "chat",
    skills: opts.skills,
    soul: opts.soul,
    userProfile: opts.userProfile,
    memories: opts.memory,
    mcpTools: opts.mcpTools,
  });

  const parts = [tiered.hot, tiered.warm];
  if (opts.pendingIntentContext) {
    parts.push(opts.pendingIntentContext);
  }
  return parts.filter(Boolean).join("\n");
}
