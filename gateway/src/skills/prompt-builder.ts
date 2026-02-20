import type { Skill } from "./types.js";

/**
 * Build the system prompt by combining active skills, memory, and soul.
 */
export function buildSystemPrompt(opts: {
  skills: Skill[];
  soul?: string;
  memory?: string[];
  mode?: "process" | "chat";
}): string {
  const parts: string[] = [];

  // Base persona
  parts.push(`你是一个智能笔记助手，帮助用户整理和回顾语音/文字记录。`);

  // Soul (user profile)
  if (opts.soul) {
    parts.push(`\n## 用户画像\n${opts.soul}`);
  }

  // Memory context
  if (opts.memory && opts.memory.length > 0) {
    parts.push(`\n## 相关记忆\n${opts.memory.join("\n")}`);
  }

  // Mode-specific instructions
  if (opts.mode === "process") {
    parts.push(`\n## 任务\n分析以下记录内容，按照激活的技能进行提取。你必须且只能返回一个合法的 JSON 对象，不要包含任何 markdown 代码块标记、注释或额外文字。`);
  } else if (opts.mode === "chat") {
    parts.push(`\n## 任务\n你正在与用户进行复盘对话。基于记忆和用户画像，帮助用户回顾和总结。自然地对话，按需提出问题和洞察。`);
  }

  // Skills
  if (opts.skills.length > 0) {
    parts.push(`\n## 激活的技能`);
    for (const skill of opts.skills) {
      parts.push(`\n### ${skill.name}\n${skill.prompt}`);
    }
  }

  // Output format for process mode
  if (opts.mode === "process") {
    const fields = opts.skills
      .flatMap((s) => s.metadata.extract_fields ?? [])
      .filter((f, i, a) => a.indexOf(f) === i);

    if (fields.length > 0) {
      parts.push(`\n## 输出格式\n返回严格的 JSON 对象（不要用 \`\`\`json 包裹），包含以下字段：`);
      for (const field of fields) {
        parts.push(`- "${field}": string[] — 提取的${field}列表`);
      }
      parts.push(`- "tags": string[] — 自动标签`);
      parts.push(`\n如果某个字段没有相关内容，返回空数组 []。不要包含额外的字段或注释。`);
      parts.push(`\n示例输出：\n{"${fields[0]}": [], "tags": []}`);
    } else {
      // Fallback: even without extract_fields, ensure JSON output
      parts.push(`\n## 输出格式\n返回严格的 JSON 对象：\n{"todos": [], "customer_requests": [], "setting_changes": [], "tags": []}\n如果某个字段没有相关内容，返回空数组。`);
    }
  }

  return parts.join("\n");
}
