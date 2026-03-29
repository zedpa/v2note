/**
 * Voice Action — 语音指令自动识别与执行
 *
 * 统一入口：用户说话后 AI 判断是"记录"还是"指令"还是"混合"，
 * 指令型直接走 Agent 工具链执行，无需用户手动切换模式。
 */
import { chatCompletion } from "../ai/provider.js";
import { todoRepo, goalRepo } from "../db/repositories/index.js";
// ── 意图分类 ───────────────────────────────────────────────────────────
const CLASSIFY_PROMPT = `你是一个语音意图分类器。判断用户这句话是"记录"（记日记/思考）、"指令"（操作待办/查询）、还是"混合"（两者都有）。

## 指令型特征
- 修改待办："把XX改到…" "给XX加个备注" "把XX推迟"
- 完成待办："XX做完了" "XX打了" "XX已经搞定"
- 删除待办："取消XX" "XX不用做了"
- 创建待办（指令语气）："提醒我…" "帮我记一下要…" "别忘了…"
- 查询："我明天有什么安排" "还有什么没做" "XX进展怎么样"

## 记录型特征
- 叙述/感想/反思/抱怨/观察
- 没有对系统的操作请求

## 混合型特征
- 同时包含叙述内容和操作指令
- 例如："开会说了涨价，提醒我明天问张总报价"

返回严格 JSON（不要 markdown 包裹）：
{
  "type": "record" | "action" | "mixed",
  "record_text": "记录部分的文本（mixed 时必填，action 时为空）",
  "actions": [
    {
      "type": "modify_todo|complete_todo|query_todo|delete_todo|create_todo|modify_goal|query_record|query_goal|general_command",
      "confidence": 0.0-1.0,
      "target_hint": "匹配关键词（人名/事项关键词）",
      "changes": {},
      "query_params": {},
      "risk_level": "low|high",
      "original_text": "指令部分原文"
    }
  ]
}

- record 类型时 actions 为空数组
- delete_todo 和批量修改的 risk_level 为 "high"，其余为 "low"
- confidence 反映你对判断的确信程度`;
export async function classifyVoiceIntent(text) {
    const messages = [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: text },
    ];
    const response = await chatCompletion(messages, { json: true, temperature: 0.2, timeout: 15000 });
    if (!response?.content) {
        return { type: "record", actions: [] };
    }
    try {
        const parsed = JSON.parse(response.content);
        return {
            type: parsed.type ?? "record",
            record_text: parsed.record_text,
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
    }
    catch {
        console.error("[voice-action] Failed to parse classify response:", response.content.slice(0, 200));
        return { type: "record", actions: [] };
    }
}
// ── 模糊匹配 ───────────────────────────────────────────────────────────
export async function matchTodoByHint(hint, ctx) {
    if (!hint || hint.trim().length === 0)
        return null;
    const todos = ctx.userId
        ? await todoRepo.findPendingByUser(ctx.userId)
        : await todoRepo.findPendingByDevice(ctx.deviceId);
    if (todos.length === 0)
        return null;
    // 分词：按中文字符和常见分隔符拆分
    const hintTokens = hint
        .replace(/[的了那个把这]/g, "")
        .split(/[\s,，。、]+/)
        .filter((t) => t.length > 0);
    let bestMatch = null;
    for (const todo of todos) {
        let score = 0;
        // 完整 hint 包含匹配
        if (todo.text.includes(hint)) {
            score = 1.0;
        }
        else {
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
export async function executeVoiceAction(action, ctx) {
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
async function executeModifyTodo(action, ctx) {
    const match = await matchTodoByHint(action.target_hint, ctx);
    if (!match) {
        return {
            action: "modify_todo",
            success: false,
            summary: `没找到和"${action.target_hint}"相关的待办`,
        };
    }
    const updates = {};
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
        if (k === "scheduled_start")
            return `时间改为 ${updates[k]}`;
        if (k === "text")
            return "更新了内容";
        if (k === "priority")
            return `优先级改为 ${updates[k]}`;
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
async function executeCompleteTodo(action, ctx) {
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
async function executeQueryTodo(action, ctx) {
    const todos = ctx.userId
        ? await todoRepo.findPendingByUser(ctx.userId)
        : await todoRepo.findPendingByDevice(ctx.deviceId);
    let filtered = todos;
    // 按日期过滤
    if (action.query_params?.date) {
        const targetDate = resolveDate(action.query_params.date);
        if (targetDate) {
            filtered = todos.filter((t) => {
                if (!t.scheduled_start)
                    return false;
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
        items: filtered.map((t) => ({
            id: t.id,
            text: t.text,
            scheduled_start: t.scheduled_start,
            done: t.done,
        })),
    };
}
async function executeDeleteTodo(action, ctx) {
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
async function executeCreateTodo(action, ctx) {
    const text = action.changes?.text ?? action.original_text;
    if (!text) {
        return {
            action: "create_todo",
            success: false,
            summary: "没有提取到待办内容",
        };
    }
    // 创建待办需要一个 record_id，这里用 placeholder
    // 实际中 process handler 会提供 recordId
    const todos = await todoRepo.createMany([{
            record_id: "voice-action",
            text,
            done: false,
        }]);
    const todoId = Array.isArray(todos) && todos.length > 0 ? todos[0]?.id : undefined;
    return {
        action: "create_todo",
        success: true,
        summary: `已创建待办"${text.slice(0, 20)}"`,
        todo_id: todoId,
    };
}
async function executeQueryGoal(action, ctx) {
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
        filtered = goals.filter((g) => g.title?.includes(action.target_hint));
    }
    return {
        action: "query_goal",
        success: true,
        summary: `找到 ${filtered.length} 个目标`,
        items: filtered.map((g) => ({
            id: g.id,
            title: g.title,
            status: g.status,
        })),
    };
}
// ── 工具函数 ───────────────────────────────────────────────────────────
function resolveDate(dateStr) {
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
//# sourceMappingURL=voice-action.js.map