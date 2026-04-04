/**
 * Voice Action — 语音指令自动识别与执行
 *
 * 统一入口：用户说话后 AI 判断是"记录"还是"指令"还是"混合"，
 * 指令型直接走 Agent 工具链执行，无需用户手动切换模式。
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, goalRepo } from "../db/repositories/index.js";
import { safeParseJson } from "../lib/text-utils.js";
import { buildDateAnchor } from "../lib/date-anchor.js";
import { createTodoTool } from "../tools/definitions/create-todo.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ActionIntent =
  | "modify_todo"
  | "complete_todo"
  | "query_todo"
  | "delete_todo"
  | "create_todo"
  | "modify_goal"
  | "query_record"
  | "query_goal"
  | "general_command";

export interface VoiceAction {
  type: ActionIntent;
  confidence: number;
  target_hint: string;
  changes?: Record<string, any>;
  query_params?: Record<string, any>;
  risk_level: "low" | "high";
  original_text: string;
}

export interface VoiceIntentResult {
  type: "record" | "action" | "mixed";
  record_text?: string;
  actions: VoiceAction[];
}

export interface ActionExecResult {
  action: ActionIntent;
  success: boolean;
  summary: string;
  todo_id?: string;
  goal_id?: string;
  items?: any[];
  changes?: Record<string, any>;
  needs_confirm?: boolean;
  confirm_summary?: string;
  skipped?: boolean;
}

interface ActionContext {
  userId?: string;
  deviceId: string;
  recordId?: string;  // 当前正在处理的记录 ID，用于 create_todo 关联
}

// ── 意图分类 ───────────────────────────────────────────────────────────

function buildClassifyPrompt(): string {
  const dateAnchor = buildDateAnchor();

  return `你是一个语音意图路由器。判断用户这句话是"记录"还是"指令"还是"混合"。

${dateAnchor}

## 分类标准

**指令型**（用户在给系统下命令）：
- 创建待办："提醒我…" "帮我记一下要…" "别忘了…" "加个待办…"
- 完成待办："XX做完了" "XX搞定了" "XX已经打了卡"
- 修改待办："把XX改到…" "给XX推迟" "把XX提前"
- 删除待办："取消XX" "XX不用做了"
- 查询："我明天有什么安排" "还有什么没做" "XX进展怎么样"

**记录型**（用户在记录/倾述/思考）：
- 叙述、感想、反思、观察、抱怨
- 没有对系统的操作请求

**混合型**（同时包含记录和指令）：
- "开会说了涨价，提醒我明天问张总报价"

## 输出规则

返回纯 JSON（不要 markdown 包裹、不要思考过程）：
{
  "type": "record" | "action" | "mixed",
  "record_text": "记录部分文本（mixed 时必填，action 时为空字符串）",
  "actions": [
    {
      "type": "modify_todo|complete_todo|query_todo|delete_todo|create_todo|modify_goal|query_record|query_goal|general_command",
      "confidence": 0.0-1.0,
      "target_hint": "匹配关键词（人名/事项关键词）",
      "changes": {
        "text": "【create_todo 必填】纯净行动描述，动词开头，去掉指令前缀和时间/日期/频率/紧急度（已提取为独立字段）",
        "scheduled_start": "ISO 时间（优先用户原话精确到分钟，参照锚点表解析优先级）",
        "priority": 1-5
      },
      "query_params": {},
      "risk_level": "low|high",
      "original_text": "指令部分原文"
    }
  ]
}

## 关键约束
- create_todo 时 changes.text **必填**，是纯净行动描述（动词开头），去掉指令前缀和时间/日期/频率/紧急度
  ✅ 用户说"帮我记一下明天去开会" → changes.text = "去开会"，scheduled_start = 明天
  ✅ 用户说"提醒我下周找张总" → changes.text = "找张总"，scheduled_start = 下周
  ❌ changes.text = "明天去开会"（"明天"已在 scheduled_start）
  ❌ changes.text = "帮我记一下明天去开会"（指令前缀 + 时间）
- scheduled_start：日期从锚点表查找，时刻以用户原话为准精确到分钟
- delete_todo 和批量修改的 risk_level 为 "high"，其余为 "low"
- record 类型时 actions 为空数组
- confidence 反映你对判断的确信度`;
}

export async function classifyVoiceIntent(text: string, forceAction?: boolean): Promise<VoiceIntentResult> {
  // v2 方案B：去掉正则预筛，全部走 AI 分类
  // 仅对极短文本（≤1字）跳过分类（如"嗯""哦"等无意义输入）
  if (text.length <= 1) {
    return { type: "record", actions: [] };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: buildClassifyPrompt() },
    { role: "user", content: text },
  ];

  const response = await chatCompletion(messages, { json: true, temperature: 0.2, timeout: 15000, tier: "fast" });

  if (!response?.content) {
    return { type: "record", actions: [] };
  }

  const parsed = safeParseJson<{ type?: string; record_text?: string; actions?: VoiceAction[] }>(response.content);
  if (!parsed) {
    console.error("[voice-action] Failed to parse classify response:", response.content.slice(0, 200));
    return { type: "record", actions: [] };
  }

  return {
    type: (parsed.type as VoiceIntentResult["type"]) ?? "record",
    record_text: parsed.record_text,
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}

// ── 模糊匹配 ───────────────────────────────────────────────────────────

export async function matchTodoByHint(
  hint: string,
  ctx: ActionContext,
): Promise<{ id: string; text: string } | null> {
  if (!hint || hint.trim().length === 0) return null;

  const todos = ctx.userId
    ? await todoRepo.findPendingByUser(ctx.userId)
    : await todoRepo.findPendingByDevice(ctx.deviceId);

  if (todos.length === 0) return null;

  // 分词：按中文字符和常见分隔符拆分
  const hintTokens = hint
    .replace(/[的了那个把这]/g, "")
    .split(/[\s,，。、]+/)
    .filter((t) => t.length > 0);

  let bestMatch: { id: string; text: string; score: number } | null = null;

  for (const todo of todos) {
    let score = 0;

    // 完整 hint 包含匹配
    if (todo.text.includes(hint)) {
      score = 1.0;
    } else {
      // 逐 token 匹配
      for (const token of hintTokens) {
        if (token.length >= 2 && todo.text.includes(token)) {
          score += 1.0 / hintTokens.length;
        }
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: todo.id, text: todo.text, score };
    }
  }

  // 阈值：至少有一个 token 匹配
  if (bestMatch && bestMatch.score >= 0.3) {
    return { id: bestMatch.id, text: bestMatch.text };
  }

  return null;
}

// ── 执行指令 ───────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.7;

export async function executeVoiceAction(
  action: VoiceAction,
  ctx: ActionContext,
): Promise<ActionExecResult> {
  // 置信度低于阈值，降级为记录
  if (action.confidence < CONFIDENCE_THRESHOLD) {
    return {
      action: action.type,
      success: false,
      summary: "置信度不足，作为日记记录",
      skipped: true,
    };
  }

  switch (action.type) {
    case "modify_todo":
      return executeModifyTodo(action, ctx);
    case "complete_todo":
      return executeCompleteTodo(action, ctx);
    case "query_todo":
      return executeQueryTodo(action, ctx);
    case "delete_todo":
      return executeDeleteTodo(action, ctx);
    case "create_todo":
      return executeCreateTodo(action, ctx);
    case "query_goal":
      return executeQueryGoal(action, ctx);
    default:
      return {
        action: action.type,
        success: false,
        summary: `暂不支持 ${action.type} 指令`,
      };
  }
}

// ── 具体执行器 ─────────────────────────────────────────────────────────

async function executeModifyTodo(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  const match = await matchTodoByHint(action.target_hint, ctx);

  if (!match) {
    return {
      action: "modify_todo",
      success: false,
      summary: `没找到和"${action.target_hint}"相关的待办`,
    };
  }

  const updates: Record<string, any> = {};

  if (action.changes?.scheduled_start) {
    updates.scheduled_start = action.changes.scheduled_start;
  }
  if (action.changes?.scheduled_end) {
    updates.scheduled_end = action.changes.scheduled_end;
  }
  if (action.changes?.priority !== undefined) {
    updates.priority = action.changes.priority;
  }
  if (action.changes?.append_note) {
    updates.text = `${match.text}（${action.changes.append_note}）`;
  }
  if (action.changes?.text) {
    updates.text = action.changes.text;
  }

  await todoRepo.update(match.id, updates);

  const changeDesc = Object.keys(updates)
    .map((k) => {
      if (k === "scheduled_start") return `时间改为 ${updates[k]}`;
      if (k === "text") return "更新了内容";
      if (k === "priority") return `优先级改为 ${updates[k]}`;
      return k;
    })
    .join("，");

  return {
    action: "modify_todo",
    success: true,
    summary: `已修改"${match.text.slice(0, 20)}"：${changeDesc}`,
    todo_id: match.id,
    changes: updates,
  };
}

async function executeCompleteTodo(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  const match = await matchTodoByHint(action.target_hint, ctx);

  if (!match) {
    return {
      action: "complete_todo",
      success: false,
      summary: `没找到和"${action.target_hint}"相关的待办`,
    };
  }

  await todoRepo.update(match.id, { done: true });

  return {
    action: "complete_todo",
    success: true,
    summary: `已完成"${match.text.slice(0, 20)}"`,
    todo_id: match.id,
  };
}

async function executeQueryTodo(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  const todos = ctx.userId
    ? await todoRepo.findPendingByUser(ctx.userId)
    : await todoRepo.findPendingByDevice(ctx.deviceId);

  let filtered = todos;

  // 按日期过滤
  if (action.query_params?.date) {
    const targetDate = resolveDate(action.query_params.date);
    if (targetDate) {
      filtered = todos.filter((t: any) => {
        if (!t.scheduled_start) return false;
        const todoDate = t.scheduled_start.split("T")[0];
        return todoDate === targetDate;
      });
    }
  }

  return {
    action: "query_todo",
    success: true,
    summary: filtered.length > 0
      ? `找到 ${filtered.length} 条待办`
      : "没有找到匹配的待办",
    items: filtered.map((t: any) => ({
      id: t.id,
      text: t.text,
      scheduled_start: t.scheduled_start,
      done: t.done,
    })),
  };
}

async function executeDeleteTodo(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  // 高风险操作一律返回 needs_confirm，不直接执行
  const match = await matchTodoByHint(action.target_hint, ctx);

  if (!match) {
    return {
      action: "delete_todo",
      success: false,
      summary: `没找到和"${action.target_hint}"相关的待办`,
    };
  }

  return {
    action: "delete_todo",
    success: false,
    needs_confirm: true,
    confirm_summary: `确认取消"${match.text}"吗？`,
    todo_id: match.id,
    summary: "需要确认",
  };
}

async function executeCreateTodo(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  const text = action.changes?.text ?? cleanActionPrefix(action.original_text);

  if (!text) {
    return {
      action: "create_todo",
      success: false,
      summary: "没有提取到待办内容",
    };
  }

  // 统一走 create_todo tool handler（复用 dedup + embedding + record 创建）
  const toolResult = await createTodoTool.handler(
    {
      text,
      link_record_id: ctx.recordId,
      scheduled_start: action.changes?.scheduled_start,
      priority: action.changes?.priority,
    },
    {
      deviceId: ctx.deviceId,
      userId: ctx.userId,
      sessionId: "voice-action",
    },
  );

  return {
    action: "create_todo",
    success: toolResult.success,
    summary: toolResult.message,
    todo_id: toolResult.data?.todo_id as string | undefined,
  };
}

async function executeQueryGoal(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  const goals = ctx.userId
    ? await goalRepo.findActiveByUser(ctx.userId)
    : await goalRepo.findActiveByDevice(ctx.deviceId);

  if (goals.length === 0) {
    return {
      action: "query_goal",
      success: true,
      summary: "暂无活跃目标",
      items: [],
    };
  }

  // 如果有 hint，做模糊匹配
  let filtered = goals;
  if (action.target_hint) {
    filtered = goals.filter((g: any) => g.title?.includes(action.target_hint));
  }

  return {
    action: "query_goal",
    success: true,
    summary: `找到 ${filtered.length} 个目标`,
    items: filtered.map((g: any) => ({
      id: g.id,
      title: g.title,
      status: g.status,
    })),
  };
}

// ── 工具函数 ───────────────────────────────────────────────────────────

/** 清洗指令前缀，提取纯净待办文本 */
function cleanActionPrefix(text: string): string {
  return text
    .replace(/^(?:帮我|请帮我|请|麻烦)?(?:记一下|记住|记得|备忘|提醒我|别忘了|加个待办|创建待办|建个待办|添加|新建)[\s，,：:]*/, "")
    .trim() || text;
}

function resolveDate(dateStr: string): string | null {
  const now = new Date();

  if (dateStr === "today") {
    return now.toISOString().split("T")[0];
  }
  if (dateStr === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  // ISO 日期
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split("T")[0];
  }

  return null;
}
