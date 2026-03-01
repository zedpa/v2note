import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Load Agent.md once at startup
let agentMd;
try {
    agentMd = readFileSync(join(__dirname, "../../Agent.md"), "utf-8");
}
catch {
    agentMd = "你是一个智能笔记助手，帮助用户整理和回顾语音/文字记录。";
}
/**
 * Build the system prompt by combining active skills, memory, and soul.
 */
export function buildSystemPrompt(opts) {
    const parts = [];
    // Base persona from Agent.md
    parts.push(agentMd);
    // Soul (AI identity definition)
    if (opts.soul) {
        parts.push(`\n## AI 身份定义\n${opts.soul}`);
    }
    // Memory context
    if (opts.memory && opts.memory.length > 0) {
        parts.push(`\n## 相关记忆\n${opts.memory.join("\n")}`);
    }
    // Mode-specific instructions
    if (opts.mode === "process") {
        parts.push(`\n## 任务\n分析以下记录内容，按照激活的技能进行提取。你必须且只能返回一个合法的 JSON 对象，不要包含任何 markdown 代码块标记、注释或额外文字。`);
        // De-colloquialization instructions
        parts.push(`\n## 转写清理规则\n对输入文本进行最小化清理，生成 summary 字段：\n- 移除口语填充词：嗯、啊、那个、就是说、然后呢、对吧、你知道吗、这个、额、哦、呃\n- 移除重复词和无意义的语气词\n- 修正明显的错别字和语音识别错误\n- 严格保留原文的表述结构：短句还是短句，倒装还是倒装，不要改写句式\n- 不要将口语转为书面语，不要合并或拆分句子\n- 不添加或删减实质内容`);
        // Tag matching rules
        if (opts.existingTags && opts.existingTags.length > 0) {
            parts.push(`\n## 标签规则\n只能从以下已有标签中选择匹配的标签，**不要创建新标签**：\n${opts.existingTags.map(t => `- "${t}"`).join("\n")}\n如果没有合适的标签匹配，tags 返回空数组 []。`);
        }
        else {
            parts.push(`\n## 标签规则\ntags 返回空数组 []，不要创建任何标签。`);
        }
    }
    else if (opts.mode === "chat") {
        parts.push(`\n## 任务\n你正在与用户进行复盘对话。基于记忆和用户画像，帮助用户回顾和总结。自然地对话，按需提出问题和洞察。`);
    }
    // Skills
    if (opts.skills.length > 0) {
        parts.push(`\n## 激活的技能`);
        for (const skill of opts.skills) {
            parts.push(`\n### ${skill.name}\n${skill.prompt}`);
        }
    }
    // MCP tools
    if (opts.mcpTools && opts.mcpTools.length > 0) {
        parts.push(`\n## 可用工具\n你可以调用以下工具来获取外部信息。如需使用工具，在 JSON 响应中添加 "tool_calls" 字段。`);
        for (const tool of opts.mcpTools) {
            parts.push(`\n### ${tool.name}\n${tool.description}`);
            if (tool.parameters) {
                parts.push(`参数: ${JSON.stringify(tool.parameters)}`);
            }
        }
        parts.push(`\n工具调用格式：\n"tool_calls": [{"name": "工具名", "arguments": {...}}]`);
    }
    // Output format for process mode
    if (opts.mode === "process") {
        const fields = opts.skills
            .flatMap((s) => s.metadata.extract_fields ?? [])
            .filter((f, i, a) => a.indexOf(f) === i);
        if (fields.length > 0) {
            parts.push(`\n## 输出格式\n返回严格的 JSON 对象（不要用 \`\`\`json 包裹），包含以下字段：`);
            parts.push(`- "summary": string — 清理后的转写文本（仅去填充词和修错别字，保留原文结构）`);
            for (const field of fields) {
                parts.push(`- "${field}": string[] — 提取的${field}列表`);
            }
            parts.push(`- "tags": string[] — 从已有标签中匹配的标签`);
            if (opts.mcpTools && opts.mcpTools.length > 0) {
                parts.push(`- "tool_calls": object[] — (可选) 需要调用的工具`);
            }
            parts.push(`\n如果某个字段没有相关内容，返回空数组 []。不要包含额外的字段或注释。`);
            parts.push(`\n示例输出：\n{"summary": "...", "${fields[0]}": [], "tags": []}`);
        }
        else {
            // Fallback: even without extract_fields, ensure JSON output
            parts.push(`\n## 输出格式\n返回严格的 JSON 对象：\n{"summary": "", "todos": [], "customer_requests": [], "setting_changes": [], "tags": []}\n如果某个字段没有相关内容，返回空数组。`);
        }
    }
    return parts.join("\n");
}
//# sourceMappingURL=prompt-builder.js.map