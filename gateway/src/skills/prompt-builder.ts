import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill } from "./types.js";
import { getSkillManifest, partitionSkillsByRelevance } from "./loader.js";
import { BUILTIN_TOOLS } from "../tools/builtin.js";
import type { ContextTier, ContextBuildOptions } from "../context/tiers.js";
import {
  PROCESS_GUARDRAILS,
  CHAT_GUARDRAILS,
  BRIEFING_GUARDRAILS,
} from "../context/anti-hallucination.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Agent.md once at startup — split into core rules vs full content
let agentMdFull: string;
let agentMdCore: string; // compact version for hot tier
try {
  agentMdFull = readFileSync(join(__dirname, "../../Agent.md"), "utf-8");
  // Extract core rules only (before command table)
  const commandTableIdx = agentMdFull.indexOf("## 指令模式");
  agentMdCore = commandTableIdx > 0
    ? agentMdFull.slice(0, commandTableIdx).trim()
    : agentMdFull;
} catch {
  agentMdFull = "你是一个智能笔记助手，帮助用户整理和回顾语音/文字记录。";
  agentMdCore = agentMdFull;
}

/**
 * Build tiered context for structured prompt assembly.
 *
 * Hot tier (~1500 chars): core rules, anti-hallucination, output format skeleton
 * Warm tier (variable): soul, relevant memories, active skill prompts
 * Cold tier: remaining context available on-demand
 */
export function buildTieredContext(opts: ContextBuildOptions): ContextTier {
  const hot: string[] = [];
  const warm: string[] = [];
  const cold: string[] = [];

  // ── HOT TIER: always present ──

  // Core persona (compact version, no command table)
  hot.push(agentMdCore);

  // Anti-hallucination guardrails (mode-specific)
  if (opts.mode === "process") {
    hot.push(`\n${PROCESS_GUARDRAILS}`);
  } else if (opts.mode === "chat") {
    hot.push(`\n${CHAT_GUARDRAILS}`);
  } else if (opts.mode === "briefing") {
    hot.push(`\n${BRIEFING_GUARDRAILS}`);
  }

  // Mode-specific task description
  if (opts.mode === "process") {
    hot.push(`\n## 任务\n分析以下记录内容，按照激活的技能进行提取。你必须且只能返回一个合法的 JSON 对象，不要包含任何 markdown 代码块标记、注释或额外文字。`);
  } else if (opts.mode === "chat") {
    hot.push(`\n## 任务\n你正在与用户进行复盘对话。基于记忆和用户画像，帮助用户回顾和总结。自然地对话，按需提出问题和洞察。`);
  }

  // Skill manifest (metadata only) — gives AI awareness without token cost
  if (opts.skills.length > 0) {
    hot.push(`\n## 可用技能概览\n${getSkillManifest(opts.skills)}`);
  }

  // ── WARM TIER: task-specific ──

  // Soul — only for chat/briefing, not process (process extracts data, doesn't need personality)
  if (opts.soul && opts.mode !== "process") {
    warm.push(`## AI 人格定义\n${opts.soul}`);
  }

  // User profile — factual info about the user (separated from soul)
  if (opts.userProfile && opts.mode !== "process") {
    warm.push(`## 用户画像\n${opts.userProfile}`);
  }

  // Memories — pre-filtered by relevance in context/loader.ts
  if (opts.memories && opts.memories.length > 0) {
    warm.push(`## 相关记忆\n${opts.memories.join("\n")}`);
  }

  // Active skill full prompts — only for skills that match input
  if (opts.skills.length > 0) {
    const { fullText, metadataOnly } = partitionSkillsByRelevance(
      opts.skills,
      opts.inputText,
    );

    if (fullText.length > 0) {
      warm.push(`## 激活的技能`);
      for (const skill of fullText) {
        warm.push(`\n### ${skill.name}\n${skill.prompt}`);
      }
    }

    // Metadata-only skills go to cold tier
    if (metadataOnly.length > 0) {
      cold.push(
        `以下技能已加载但未展开详情（当前输入可能不相关）：\n` +
        metadataOnly.map((s) => `- ${s.name}: ${s.description}`).join("\n"),
      );
    }
  }

  // Process-mode specific warm context
  if (opts.mode === "process") {
    // De-colloquialization rules
    warm.push(`## 转写清理规则\n对输入文本进行最小化清理，生成 summary 字段：\n- 移除口语填充词：嗯、啊、那个、就是说、然后呢、对吧、你知道吗、这个、额、哦、呃\n- 移除重复词和无意义的语气词\n- 修正明显的错别字和语音识别错误\n- 严格保留原文的表述结构：短句还是短句，倒装还是倒装，不要改写句式\n- 不要将口语转为书面语，不要合并或拆分句子\n- 不添加或删减实质内容`);

    // Tag matching rules
    if (opts.existingTags && opts.existingTags.length > 0) {
      warm.push(`## 标签规则\n只能从以下已有标签中选择匹配的标签，**不要创建新标签**：\n${opts.existingTags.map(t => `- "${t}"`).join("\n")}\n如果没有合适的标签匹配，tags 返回空数组 []。`);
    } else {
      warm.push(`## 标签规则\ntags 返回空数组 []，不要创建任何标签。`);
    }
  }

  // Tools — descriptions in warm tier, full param schemas in cold tier
  const allTools = [
    ...BUILTIN_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    ...(opts.mcpTools ?? []),
  ];
  if (allTools.length > 0) {
    // Warm: tool names + descriptions only
    warm.push(`## 可用工具\n你可以调用以下工具来执行操作。`);
    for (const tool of allTools) {
      warm.push(`\n### ${tool.name}\n${tool.description}`);
    }

    // Cold: full parameter schemas
    const toolSchemas = allTools
      .filter((t) => t.parameters)
      .map((t) => `${t.name}: ${JSON.stringify(t.parameters)}`);
    if (toolSchemas.length > 0) {
      cold.push(`工具参数详情：\n${toolSchemas.join("\n")}`);
    }

    if (opts.mode === "chat") {
      warm.push(`\n## 工具调用规则（重要）
当你需要调用工具时，你的**整条回复**必须是且仅是一个 JSON 对象，不要包含任何其他文字。格式：
{"tool_calls": [{"name": "工具名", "arguments": {...}}]}

错误示范（不要这样做）：
好的，我来帮你记录。{"tool_calls": [...]}

正确示范：
{"tool_calls": [{"name": "create_diary", "arguments": {"content": "明天开会", "title": "开会"}}]}

工具执行后系统会自动把结果告诉你，届时你再用自然语言回复用户。
如果不需要调用工具，正常用自然语言回复即可。`);
    } else {
      warm.push(`\n工具调用格式：\n"tool_calls": [{"name": "工具名", "arguments": {...}}]`);
    }
  }

  // Output format (process mode)
  if (opts.mode === "process") {
    const fields = opts.skills
      .flatMap((s) => s.metadata.extract_fields ?? [])
      .filter((f, i, a) => a.indexOf(f) === i);

    if (fields.length > 0) {
      warm.push(`\n## 输出格式\n返回严格的 JSON 对象（不要用 \`\`\`json 包裹），包含以下字段：`);
      warm.push(`- "summary": string — 清理后的转写文本（仅去填充词和修错别字，保留原文结构）`);
      for (const field of fields) {
        warm.push(`- "${field}": string[] — 提取的${field}列表`);
      }
      warm.push(`- "tags": string[] — 从已有标签中匹配的标签`);
      if (allTools.length > 0) {
        warm.push(`- "tool_calls": object[] — (可选) 需要调用的工具`);
      }
      warm.push(`\n如果某个字段没有相关内容，返回空数组 []。不要包含额外的字段或注释。`);
      warm.push(`\n示例输出：\n{"summary": "...", "${fields[0]}": [], "tags": []}`);
    } else {
      warm.push(`\n## 输出格式\n返回严格的 JSON 对象：\n{"summary": "", "todos": [], "customer_requests": [], "setting_changes": [], "tags": []}\n如果某个字段没有相关内容，返回空数组。`);
    }
  }

  // Cold: full Agent.md (including command table) for reference
  if (agentMdFull !== agentMdCore) {
    cold.push(agentMdFull);
  }

  return {
    hot: hot.join("\n"),
    warm: warm.join("\n"),
    cold,
  };
}

/**
 * Build the system prompt by combining active skills, memory, and soul.
 * Backward-compatible wrapper that concatenates hot + warm tiers.
 */
export function buildSystemPrompt(opts: {
  skills: Skill[];
  soul?: string;
  userProfile?: string;
  memory?: string[];
  mode?: "process" | "chat";
  existingTags?: string[];
  mcpTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  /** Input text for relevance-based skill filtering */
  inputText?: string;
  /** Pre-built pending intent context to inject into warm tier */
  pendingIntentContext?: string;
}): string {
  const tiered = buildTieredContext({
    mode: opts.mode ?? "process",
    skills: opts.skills,
    soul: opts.soul,
    userProfile: opts.userProfile,
    memories: opts.memory,
    existingTags: opts.existingTags,
    mcpTools: opts.mcpTools,
    inputText: opts.inputText,
  });

  const parts = [tiered.hot, tiered.warm];
  if (opts.pendingIntentContext) {
    parts.push(opts.pendingIntentContext);
  }
  return parts.filter(Boolean).join("\n");
}
