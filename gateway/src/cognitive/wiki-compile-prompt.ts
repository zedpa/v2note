/**
 * Wiki 编译 prompt 构建 — 为 AI 编译引擎生成编译指令的 prompt
 *
 * 输入：新 Record 文本、命中的 wiki page content、全量 page 索引、已有 domain 列表
 * 输出：结构化的编译 prompt（系统提示 + 用户消息）
 */

import { buildDateAnchor } from "../lib/date-anchor.js";

/** 编译 prompt 输入 */
export interface CompilePromptInput {
  newRecords: {
    id: string;
    text: string;
    source_type: string;
    created_at: string;
  }[];
  matchedPages: {
    id: string;
    title: string;
    content: string;
    summary: string;
    level: number;
    domain: string | null;
  }[];
  allPageIndex: {
    id: string;
    title: string;
    summary: string | null;
    level: number;
    domain: string | null;
  }[];
  existingDomains: string[];
  isColdStart: boolean;
}

/** 编译 prompt 输出（系统 + 用户消息对） */
export interface CompilePromptOutput {
  system: string;
  user: string;
}

/**
 * 构建编译 prompt
 *
 * 指导 AI 阅读所有新 Record，参照已有 wiki page，
 * 输出 JSON 编译指令（update_pages, create_pages, split_page, merge_pages, goal_sync）
 */
export function buildCompilePrompt(input: CompilePromptInput): CompilePromptOutput {
  const { newRecords, matchedPages, allPageIndex, existingDomains, isColdStart } = input;

  const dateAnchor = buildDateAnchor();

  // 系统提示
  const system = buildSystemPrompt(dateAnchor, existingDomains, isColdStart);

  // 用户消息：包含 Record 文本 + 命中 page 的 content + 全量索引
  const user = buildUserMessage(newRecords, matchedPages, allPageIndex);

  return { system, user };
}

function buildSystemPrompt(
  dateAnchor: string,
  existingDomains: string[],
  isColdStart: boolean,
): string {
  const domainHint = existingDomains.length > 0
    ? `用户已有的 domain 分类：${existingDomains.join("、")}。优先复用已有 domain，保持一致性。`
    : "用户暂无已有 domain 分类，可自行判断合适的一级分类。";

  const coldStartHint = isColdStart
    ? `\n\n【冷启动模式】用户当前没有任何 wiki page，这是首次编译。请创建 1-2 个宽泛的 L3 page（如"工作与生活"），不强制拆分，等内容自然积累。`
    : "";

  return `你是认知编译引擎。你的任务是将用户的新日记/语音记录（Record）编译到用户的个人知识 Wiki 中。

${dateAnchor}

## 编译规则

1. **阅读所有新 Record**，理解用户表达的内容和意图
2. **参照已有 wiki page** 的完整 content 和 page 索引，决定如何整合新信息
3. **输出 JSON 编译指令**（严格遵循下方格式）

### Content 格式规范

每个 wiki page 的 content 字段使用以下 markdown 结构：

\`\`\`markdown
## 核心认知
[AI 对该主题的综合理解，保留用户原话和因果链]

## 关键决策链
- YYYY-MM-DD: [决策描述，含因果] [→ rec:UUID]

## 矛盾 / 未决
- [矛盾描述]（状态：未解决/已解决）

## 目标
- 【状态】目标标题 → goal:UUID

## 实体
- [人名/组织/关键词]: [简述关系]
\`\`\`

### 来源标注规则

- 每段叙事文字后附带 \`[→ rec:UUID]\` 指针，标注信息来源
- 置信度标签：
  - \`[直述]\`：用户原话直接编译
  - \`[推断]\`：从多条 Record 归纳，必须标注推断依据
  - \`[关联]\`：跨 page 的语义关联
- **禁止**添加 AI 自己的推理（如"这表明..."），只编译用户说了什么
- 保留用户原话中的不确定语气（"可能""觉得"）和归属（"张总说"）

### AI 决策规则

- 新 Record 内容匹配已有 page → \`update_pages\`（追加/修改对应段落）
- 新 Record 涉及全新主题，且有 2+ 条 think/voice 类 Record → \`create_pages\`
- 仅有 1 条 material 类 Record → **不创建新页**，等更多输入
- material 类 Record 只作为参考资料追加到已有 page，不独立创建新页
- 两个 page 高度重叠 → \`merge_pages\`
- 一个 page 覆盖了多个明显不同的子主题 → \`split_page\`
- 发现新目标或目标状态变化 → \`goal_sync\`

### Domain 分类规则

${domainHint}
- domain 是简短中文一级分类："工作"、"生活"、"学习"、"健康"等
- 可带二级路径："工作/采购"、"生活/旅行"
- 不确定时设为 null
${coldStartHint}

## JSON 输出格式

严格按以下 JSON 结构输出，不要包含任何其他文字：

\`\`\`json
{
  "update_pages": [
    {
      "page_id": "UUID",
      "new_content": "完整的 markdown 内容（覆盖写入）",
      "new_summary": "一句话摘要",
      "add_record_ids": ["rec-uuid-1"]
    }
  ],
  "create_pages": [
    {
      "title": "新主题名称（2-8个中文字符）",
      "content": "markdown 内容",
      "summary": "一句话摘要",
      "parent_id": "UUID 或 null",
      "level": 3,
      "domain": "分类",
      "record_ids": ["rec-uuid-1"]
    }
  ],
  "merge_pages": [
    { "source_id": "UUID", "target_id": "UUID", "reason": "合并原因" }
  ],
  "split_page": [
    {
      "source_id": "UUID",
      "new_parent_content": "拆分后的父页 markdown",
      "children": [
        { "title": "子页标题", "content": "markdown", "summary": "一句话摘要" }
      ]
    }
  ],
  "goal_sync": [
    {
      "action": "create",
      "title": "目标标题",
      "status": "active",
      "wiki_page_id": "UUID"
    }
  ]
}
\`\`\`

如果某个指令类型没有操作，传空数组 \`[]\`。`;
}

function buildUserMessage(
  newRecords: CompilePromptInput["newRecords"],
  matchedPages: CompilePromptInput["matchedPages"],
  allPageIndex: CompilePromptInput["allPageIndex"],
): string {
  const parts: string[] = [];

  // 新 Record 列表
  parts.push("## 新 Record（待编译）\n");
  for (const rec of newRecords) {
    const typeLabel = rec.source_type === "material" ? "[外部素材]" : "[用户日记]";
    parts.push(`### Record ${rec.id} ${typeLabel} (${rec.created_at})`);
    parts.push(rec.text);
    parts.push("");
  }

  // 命中的 page 完整内容
  if (matchedPages.length > 0) {
    parts.push("\n## 命中的 Wiki Page（完整内容）\n");
    for (const page of matchedPages) {
      parts.push(`### Page ${page.id}: ${page.title} (L${page.level}, domain=${page.domain ?? "未分类"})`);
      parts.push(`摘要: ${page.summary}`);
      parts.push(page.content);
      parts.push("");
    }
  }

  // 全量 page 索引
  if (allPageIndex.length > 0) {
    parts.push("\n## 全部 Wiki Page 索引\n");
    parts.push("| ID | 标题 | 摘要 | 层级 | Domain |");
    parts.push("|-----|------|------|------|--------|");
    for (const page of allPageIndex) {
      parts.push(
        `| ${page.id} | ${page.title} | ${page.summary ?? "-"} | L${page.level} | ${page.domain ?? "-"} |`,
      );
    }
  }

  parts.push("\n请根据以上信息输出 JSON 编译指令。");

  return parts.join("\n");
}
