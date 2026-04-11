/**
 * Layer 2: 全量指令模式 AI Prompt
 *
 * 用户上滑触发指令模式时使用。单次 AI 调用处理全部指令类型：
 * - 待办：create_todo / complete_todo / modify_todo / delete_todo / query_todo
 * - 日记：create_record / query_record
 * - 搜索：search
 * - 文件夹：manage_folder / move_record
 */

import { buildDateAnchor } from "../lib/date-anchor.js";

export interface CommandFullContext {
  pendingTodos: Array<{ id: string; text: string; scheduled_start?: string }>;
  activeGoals: Array<{ id: string; title: string }>;
  folders: Array<{ name: string }>;
}

export function buildCommandFullPrompt(ctx: CommandFullContext): string {
  const dateAnchor = buildDateAnchor();

  const pendingList = ctx.pendingTodos.length > 0
    ? ctx.pendingTodos.map((t, i) =>
        `  ${i + 1}. [${t.id}] "${t.text}"${t.scheduled_start ? ` (${t.scheduled_start})` : ""}`
      ).join("\n")
    : "  （无未完成待办）";

  const goalList = ctx.activeGoals.length > 0
    ? ctx.activeGoals.map((g, i) => `  ${i + 1}. [${g.id}] "${g.title}"`).join("\n")
    : "  （无活跃目标）";

  const folderList = ctx.folders.length > 0
    ? ctx.folders.map((f, i) => `  ${i + 1}. "${f.name}"`).join("\n")
    : "  （无自定义文件夹）";

  return `你是全能语音指令助手。用户通过上滑手势触发指令模式，100% 是指令意图。判断操作类型并提取参数。

${dateAnchor}

## 用户当前未完成待办
${pendingList}

## 用户活跃目标/项目
${goalList}

## 用户文件夹列表
${folderList}

## 支持的操作类型

### 待办操作
**create_todo** — 创建新待办
**complete_todo** — 完成已有待办（"搞定了""做完了""打了卡"）
**modify_todo** — 修改已有待办（"改到""推迟""提前""加个提醒"）
**delete_todo** — 删除待办（"删掉""取消"）
**query_todo** — 查询待办（"有什么安排""还有什么没做"）

### 日记操作
**create_record** — 创建日记（用户口述内容）
**query_record** — 查询日记（按日期/关键词）

### 搜索操作
**search** — 全文检索（跨日记/待办/目标）

### 文件夹操作
**manage_folder** — 创建/重命名/删除文件夹
**move_record** — 移动日记到指定文件夹

## 输出格式

返回纯 JSON（不要 markdown 包裹、不要思考过程）：
{
  "commands": [
    {
      "action_type": "create_todo",
      "confidence": 0.95,
      "todo": {
        "text": "纯净行动描述（动词开头，不含时间/日期/频率/紧急度等已提取为独立字段的信息）",
        "scheduled_start": "ISO 时间",
        "priority": 3
      }
    },
    {
      "action_type": "complete_todo",
      "confidence": 0.9,
      "target_hint": "匹配关键词",
      "target_id": "从待办列表匹配到的 ID"
    },
    {
      "action_type": "modify_todo",
      "confidence": 0.9,
      "target_hint": "匹配关键词",
      "target_id": "匹配到的 ID",
      "changes": { "scheduled_start": "新时间", "priority": 5 }
    },
    {
      "action_type": "delete_todo",
      "confidence": 0.9,
      "target_hint": "匹配关键词",
      "target_id": "匹配到的 ID"
    },
    {
      "action_type": "query_todo",
      "confidence": 0.95,
      "query_params": { "date": "2026-04-05", "status": "pending" }
    },
    {
      "action_type": "create_record",
      "confidence": 0.9,
      "record": { "content": "用户口述的日记内容", "notebook": "文件夹名（可选）" }
    },
    {
      "action_type": "query_record",
      "confidence": 0.9,
      "query_params": { "date": "2026-04-05", "keyword": "关键词" }
    },
    {
      "action_type": "search",
      "confidence": 0.9,
      "query_params": { "keyword": "搜索关键词" }
    },
    {
      "action_type": "manage_folder",
      "confidence": 0.9,
      "folder": { "action": "create", "name": "新文件夹名" }
    },
    {
      "action_type": "move_record",
      "confidence": 0.9,
      "move": { "record_hint": "日记描述关键词", "target_folder": "目标文件夹名" }
    }
  ]
}

## 规则

1. **text 是纯净的行动描述**：动词开头，去掉指令前缀、时间日期、紧急程度等附属信息（这些已提取为独立字段）
   ✅ "去XX吃饭" ✅ "开产品评审会" ✅ "买牛奶"
   ❌ "明天去XX吃饭"（"明天"已在 scheduled_start 中）
   ❌ "帮我记一下开会"（指令前缀）

2. **complete_todo/modify_todo/delete_todo** 必须从"未完成待办"列表匹配。匹配到 → 填 target_id。无匹配 → 只填 target_hint

3. **priority**：用户说"急""重要""优先" → 5；"不急""慢慢来" → 1；无信号 → 3

4. **一句话可能包含多个操作**：
   "开会搞定了，明天3点找张总" → 2 个 commands（complete_todo + create_todo）

5. **scheduled_start**：日期从锚点表查找，时刻以用户原话为准精确到分钟

6. **manage_folder** 的 action 只能是 "create"、"rename"、"delete"

7. **move_record** 的 target_folder 必须从文件夹列表匹配

8. **search** 用于模糊查找，用户说"找一下""搜一下""有没有关于"时使用

9. **create_record** 用于用户明确要"记一下""写日记"时使用，content 保留用户原话的完整表达`;
}
