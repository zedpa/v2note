/**
 * Wiki 编译 prompt 构建 — 为 AI 编译引擎生成编译指令的 prompt
 *
 * 输入：新 Record 文本、命中的 wiki page content、全量 page 索引
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
  }[];
  allPageIndex: {
    id: string;
    title: string;
    summary: string | null;
    level: number;
    page_type?: "topic" | "goal";
  }[];
  existingGoals: Array<{
    id: string;       // todo.id
    title: string;
    status: string;
    wiki_page_id: string | null;
  }>;
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
  const { newRecords, matchedPages, allPageIndex, existingGoals, isColdStart } = input;

  const dateAnchor = buildDateAnchor();

  // 系统提示
  const system = buildSystemPrompt(dateAnchor, isColdStart);

  // 用户消息：包含 Record 文本 + 命中 page 的 content + 全量索引 + 已有目标
  const user = buildUserMessage(newRecords, matchedPages, allPageIndex, existingGoals);

  return { system, user };
}

function buildSystemPrompt(
  dateAnchor: string,
  isColdStart: boolean,
): string {
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
- goal_sync 创建前，必须检查「已有目标」列表。如果已有 goal 的标题与新 goal 语义一致（如"学英语"和"英语学习"），使用 update 而非 create
- ❌ 反例：已有"学英语"时又 create "英语学习" → 应 update 已有 goal
- goal_sync.create 时，parent_page_id 应填写该 goal 最相关的 topic page UUID
- goal_sync.create 只用于**持续性意图**：需多步/多日完成、可衡量进展的长期目标
- ❌ 禁止创建：口语化一次性事项（"今天买菜""下午开会""明天带伞"）
- ❌ 禁止创建：情绪表达/非行动项（"好累啊""天气真好""最近压力大"）
- ❌ 禁止创建：已在 todo 中作为 level=0 存在的行动项
- ✅ 目标示例：学英语、减肥、完成毕业论文、Q2 业绩目标
- 新 Record 内容涉及多个 page 的主题 → \`links\`（在 page 间建立语义关联）

### 跨页链接规则（links）

- 编译时如果发现新 Record 涉及多个 page 的主题，在 \`links\` 中输出关联
- link_type 分类：
  - \`reference\`：A 内容直接引用了 B 的内容（如"与采购策略相关"）
  - \`related\`：A 和 B 讨论了相关主题
  - \`contradicts\`：A 和 B 存在矛盾观点
- source_page_id 和 target_page_id 必须来自上方的 page 索引，禁止编造 ID
- context_text 简要描述关联原因

### Title 命名规则

- 自然语言命名，如同笔记本目录中的标题
- L3 page title 可以简短："工作"、"思考"、"学习"（分类标签，允许宽泛）
- L2/L1 topic page title 应具体自然："供应链优化"、"React Hook 实践"、"家庭装修计划"
- goal page 的 title = 目标本身："通过四级考试"、"今年减重10kg"
- 好的例子："Q2 采购策略"、"React 学习笔记"
- 坏的例子："工作管理"（太泛）、"明天要和张总确认报价"（太长/临时）
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
      "title": "自然语言命名的主题标题",
      "content": "markdown 内容",
      "summary": "一句话摘要",
      "parent_id": "UUID 或 null",
      "level": 3,
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
      "wiki_page_id": "UUID（已有 goal page 则填，否则省略）",
      "parent_page_id": "UUID（挂载到哪个 topic page 下）"
    },
    {
      "action": "update",
      "goal_id": "UUID（已有目标列表中的 goal_id）",
      "status": "progressing"
    }
  ],
  "links": [
    {
      "source_page_id": "UUID — 发起链接的 page",
      "target_page_id": "UUID — 被链接到的 page",
      "link_type": "reference | related | contradicts",
      "context_text": "链接上下文描述（如'提到了采购策略'）"
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
  existingGoals: CompilePromptInput["existingGoals"],
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
      parts.push(`### Page ${page.id}: ${page.title} (L${page.level})`);
      parts.push(`摘要: ${page.summary}`);
      parts.push(page.content);
      parts.push("");
    }
  }

  // 全量 page 索引
  if (allPageIndex.length > 0) {
    parts.push("\n## 全部 Wiki Page 索引\n");
    parts.push("| ID | 标题 | 摘要 | 层级 | 类型 |");
    parts.push("|-----|------|------|------|------|");
    for (const page of allPageIndex) {
      parts.push(
        `| ${page.id} | ${page.title} | ${page.summary ?? "-"} | L${page.level} | ${page.page_type ?? "topic"} |`,
      );
    }
  }

  // 已有目标列表（goal_sync 去重参照）
  if (existingGoals && existingGoals.length > 0) {
    parts.push("\n## 已有目标（创建 goal 前必须检查，避免重复）\n");
    parts.push("| goal_id | 标题 | 状态 | 关联 Page |");
    parts.push("|---------|------|------|-----------|");
    for (const goal of existingGoals) {
      parts.push(
        `| ${goal.id} | ${goal.title} | ${goal.status} | ${goal.wiki_page_id ?? "-"} |`,
      );
    }
  }

  parts.push("\n请根据以上信息输出 JSON 编译指令。");

  return parts.join("\n");
}
