/**
 * Layer 1: 待办全能模式 AI Prompt
 *
 * 用户在待办页面录音时使用。单次 AI 调用提取：
 * - action_type: create / complete / modify / query
 * - 全量待办参数（text, time, reminder, priority, recurrence, goal_hint）
 */

import { buildDateAnchor } from "../lib/date-anchor.js";

export interface TodoModeContext {
  pendingTodos: Array<{ id: string; text: string; scheduled_start?: string }>;
  activeGoals: Array<{ id: string; title: string }>;
}

export function buildTodoExtractPrompt(ctx: TodoModeContext): string {
  const dateAnchor = buildDateAnchor();

  const pendingList = ctx.pendingTodos.length > 0
    ? ctx.pendingTodos.map((t, i) =>
        `  ${i + 1}. [${t.id}] "${t.text}"${t.scheduled_start ? ` (${t.scheduled_start})` : ""}`
      ).join("\n")
    : "  （无未完成待办）";

  const goalList = ctx.activeGoals.length > 0
    ? ctx.activeGoals.map((g, i) => `  ${i + 1}. "${g.title}"`).join("\n")
    : "  （无活跃目标）";

  return `你是待办助手。用户在待办页面说话，100% 是待办相关操作。判断操作类型并提取参数。

${dateAnchor}

## 用户当前未完成待办
${pendingList}

## 用户活跃目标/项目
${goalList}

## 操作类型

**create** — 创建新待办
**complete** — 完成已有待办（"搞定了""做完了""打了卡"）
**modify** — 修改已有待办（"改到""推迟""提前""加个提醒"）
**query** — 查询待办（"有什么安排""还有什么没做"）

## 输出格式

返回纯 JSON（不要 markdown 包裹、不要思考过程）：
{
  "commands": [
    {
      "action_type": "create",
      "confidence": 0.95,
      "todo": {
        "text": "纯净行动描述（动词开头，不含时间/日期/频率/紧急度等已提取为独立字段的信息）",
        "scheduled_start": "ISO 时间（优先用户原话精确到分钟，参照锚点表解析优先级）",
        "scheduled_end": "ISO 时间（截止日期，如"周五之前"）",
        "estimated_minutes": 30,
        "priority": 3,
        "person": "相关人名",
        "goal_hint": "从目标列表中匹配的目标名称原文（无匹配则 null）",
        "reminder": {
          "enabled": true,
          "before_minutes": 15,
          "types": ["notification"]
        },
        "recurrence": {
          "rule": "daily",
          "end_date": null
        }
      }
    },
    {
      "action_type": "complete",
      "confidence": 0.9,
      "target_hint": "匹配关键词",
      "target_id": "从待办列表匹配到的 ID（8位前缀）"
    },
    {
      "action_type": "modify",
      "confidence": 0.9,
      "target_hint": "匹配关键词",
      "target_id": "匹配到的 ID",
      "changes": { "scheduled_start": "新时间", "priority": 5 }
    },
    {
      "action_type": "query",
      "confidence": 0.95,
      "query_params": { "date": "2026-04-05", "status": "pending" }
    }
  ]
}

## 规则

1. **text 是纯净的行动描述**：动词开头，去掉指令前缀、时间日期、紧急程度等附属信息（这些已提取为独立字段）
   ✅ "去XX吃饭" ✅ "开产品评审会" ✅ "买牛奶" ✅ "给张总打电话"
   ❌ "明天去XX吃饭"（"明天"已在 scheduled_start 中）
   ❌ "帮我记一下开会"（指令前缀）
   ❌ "紧急处理报告"（"紧急"已在 priority 中）
   ❌ "每天早上跑步"（"每天早上"已在 recurrence + scheduled_start 中）

2. **goal_hint** 必须是上方目标列表中的原文，不要自己编造。无匹配 → null

3. **reminder 规则**：
   - 用户说"提醒我" → enabled=true, types=["notification"]
   - 用户说"设个闹钟" → types=["alarm"]
   - 用户说"加到日历" → types=["calendar"]
   - 用户没提提醒 → 不输出 reminder 字段
   - before_minutes 默认 15，用户说"提前半小时"→30，"提前1小时"→60

4. **recurrence 规则**：
   - "每天" → rule="daily"
   - "工作日" → rule="weekdays"
   - "每周三" → rule="weekly:3"（0=周日,1=周一...6=周六）
   - "每周一三五" → rule="weekly:1,3,5"
   - "每月15号" → rule="monthly:15"
   - "每周末" → rule="weekly:0,6"
   - 不是周期 → 不输出 recurrence 字段

5. **complete/modify** 必须从"未完成待办"列表匹配。匹配到 → 填 target_id。无匹配 → 只填 target_hint

9. **停止周期任务**（"以后不用提醒我锻炼了""不用再跑步了""取消每天打卡"）：
   用 action_type="modify"，changes 中设 recurrence.end_date 为锚点表中今天的 ISO 日期字符串（如 "2026-04-24"）。
   示例：{ "action_type": "modify", "target_hint": "锻炼", "changes": { "recurrence": { "end_date": "2026-04-24" } } }

6. **priority**：用户说"急""重要""优先" → 5；"不急""慢慢来" → 1；无信号 → 3

7. **一句话可能包含多个操作**：
   "开会搞定了，明天3点找张总" → 2 个 commands（complete + create）

8. **scheduled_start**：日期从锚点表查找，时刻以用户原话为准精确到分钟`;
}

/**
 * 继续说话修改 prompt — 用户在确认弹窗中追加修改指令
 */
export function buildTodoRefinePrompt(
  currentCommands: unknown[],
  dateAnchor?: string,
): string {
  return `用户正在确认待办，想要修改部分内容。

${dateAnchor ?? buildDateAnchor()}

当前待办数据：
${JSON.stringify(currentCommands, null, 2)}

用户的修改指令在下一条消息。请返回修改后的完整 commands JSON（格式与上面相同）。
只修改用户提到的字段，其余保持不变。`;
}
