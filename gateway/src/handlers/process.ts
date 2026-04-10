import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { appendToDiary } from "../diary/manager.js";
import { recordRepo, summaryRepo, todoRepo, tagRepo } from "../db/repositories/index.js";
import { classifyVoiceIntent, executeVoiceAction, matchTodoByHint, type VoiceAction, type ActionExecResult } from "./voice-action.js";
import { safeParseJson } from "../lib/text-utils.js";
import { toLocalDateTime } from "../lib/tz.js";
import { buildTodoExtractPrompt, buildTodoRefinePrompt, type TodoModeContext } from "./todo-extract-prompt.js";
import { buildUnifiedProcessPrompt, type UnifiedProcessContext } from "./unified-process-prompt.js";

export interface LocalConfigPayload {
  soul?: { content: string };
  skills?: { configs: Array<{ name: string; enabled: boolean; description?: string; type?: string; prompt?: string; builtin?: boolean }> };
  settings?: Record<string, unknown>;
  existingTags?: string[];
}

export type SourceContext = "todo" | "timeline" | "chat" | "review";

/** 按页面上下文定义可用的 command 类型白名单，后续由 localConfig 覆盖 */
const DEFAULT_COMMAND_WHITELIST: Record<string, string[]> = {
  timeline: ["create_todo", "modify_todo"],
  todo: ["create_todo", "complete_todo", "modify_todo", "query_todo"],
  chat: ["create_todo", "complete_todo", "modify_todo", "query_todo"],
  review: ["create_todo", "modify_todo"],
};

export interface ProcessPayload {
  text: string;
  audioUrl?: string;
  deviceId: string;
  userId?: string;
  recordId?: string;
  notebook?: string;
  localConfig?: LocalConfigPayload;
  forceCommand?: boolean;  // 上滑手势触发，跳过 AI 分类，直接走 Agent 工具链
  sourceContext?: SourceContext;  // 用户当前页面上下文
}

export interface RelayExtract {
  text: string;
  source_person?: string;
  target_person?: string;
  context?: string;
  direction?: "outgoing" | "incoming";
}

export interface IntentSignal {
  type: "task" | "wish" | "goal" | "complaint" | "reflection";
  text: string;
  context?: string;
}

export interface ProcessResult {
  todos?: string[];
  intents?: IntentSignal[];
  pending_followups?: number;
  tags?: string[];
  relays?: RelayExtract[];
  summary?: string;
  error?: string;
  /** voice-action: 执行结果（指令型/混合型时存在） */
  action_results?: ActionExecResult[];
  /** voice-action: 意图类型 (record/action/mixed) */
  voice_intent_type?: "record" | "action" | "mixed";
  /** voice-action: 高风险操作等待用户确认的 ID */
  pending_confirm?: { confirm_id: string; summary: string };
  /** Layer 1: 待办全能模式 — AI 提取的待办指令（前端 CommandSheet 用） */
  todo_commands?: TodoCommand[];
}

/** Layer 1 待办指令 */
export interface TodoCommand {
  action_type: "create" | "complete" | "modify" | "query";
  confidence: number;
  todo?: ExtractedTodo;
  target_hint?: string;
  target_id?: string;
  changes?: Partial<ExtractedTodo>;
  query_params?: { date?: string; goal_id?: string; status?: string };
  /** query 结果：后端查询后填充 */
  query_result?: Array<{ id: string; text: string; scheduled_start?: string; done: boolean; priority?: number }>;
}

export interface ExtractedTodo {
  text: string;
  scheduled_start?: string;
  scheduled_end?: string;
  estimated_minutes?: number;
  priority?: number;
  person?: string;
  goal_hint?: string | null;
  reminder?: {
    enabled: boolean;
    before_minutes: number;
    types: ("notification" | "alarm" | "calendar")[];
  };
  recurrence?: {
    rule: string;
    end_date?: string | null;
  };
}

// v2: CLEANUP_SYSTEM_PROMPT 不再单独使用 — 文本清理已合并到统一 prompt 中

/**
 * Process a single diary entry: clean transcript text, save summary, trigger digest.
 *
 * 三层路由（v2）：
 * Layer 1: sourceContext="todo" → 待办全能模式（不存日记、不 Digest）
 * Layer 2: forceCommand=true → 全量 Agent 模式（不存日记、不 Digest）
 * Layer 3: 其余 → AI 分类 + 存日记 + 条件 Digest
 */
export async function processEntry(payload: ProcessPayload): Promise<ProcessResult> {
  const result: ProcessResult = {};

  try {
    const t0 = Date.now();
    console.log(`[process] Starting for record ${payload.recordId}, text length: ${payload.text.length}, sourceContext: ${payload.sourceContext}, forceCommand: ${payload.forceCommand}`);

    // ── Layer 1: 待办全能模式 ─────────────────────────────────────
    if (payload.sourceContext === "todo") {
      console.log(`[process] Layer 1: Todo full mode`);
      result.voice_intent_type = "action";
      try {
        const todoResult = await todoFullMode(payload);
        result.todo_commands = todoResult.commands;
        result.action_results = todoResult.actionResults;
      } catch (err: any) {
        console.error(`[process] Layer 1 failed, returning error: ${err.message}`);
        result.error = `待办识别失败: ${err.message}`;
      }
      if (payload.recordId) {
        await recordRepo.updateStatus(payload.recordId, "completed");
      }
      console.log(`[process][⏱ layer1-total] ${Date.now() - t0}ms`);
      return result;
    }

    // ── Layer 2: 全量 Agent 模式（上滑手势） ──────────────────────
    // 只分类 + 提取，不执行。写入操作由前端确认后走 REST API
    // 查询操作直接执行并返回结果
    if (payload.forceCommand) {
      console.log(`[process] Layer 2: Agent command mode`);
      result.voice_intent_type = "action";
      try {
        const intentResult = await classifyVoiceIntent(payload.text, true);
        if (intentResult.actions.length > 0) {
          const ACTION_TYPE_MAP: Record<string, TodoCommand["action_type"]> = {
            create_todo: "create", complete_todo: "complete",
            modify_todo: "modify", query_todo: "query",
          };

          const todoCommands: TodoCommand[] = [];
          const actionResults: ActionExecResult[] = [];

          for (const action of intentResult.actions) {
            const mappedType = ACTION_TYPE_MAP[action.type];

            // 查询操作直接执行
            if (mappedType === "query") {
              const queryResult = await executeVoiceAction(action, {
                userId: payload.userId,
                deviceId: payload.deviceId,
                recordId: payload.recordId,
              });
              todoCommands.push({
                action_type: "query",
                confidence: action.confidence,
                query_params: action.query_params,
                query_result: queryResult.items?.map((t: any) => ({
                  id: t.id, text: t.text,
                  scheduled_start: t.scheduled_start,
                  done: t.done, priority: t.priority,
                })),
              });
              actionResults.push(queryResult);
              continue;
            }

            // 写入操作（create/complete/modify）→ 提取信息返回前端确认
            // complete/modify 需要先匹配 target_id
            let targetId: string | undefined;
            if ((mappedType === "complete" || mappedType === "modify") && action.target_hint) {
              const match = await matchTodoByHint(action.target_hint, {
                userId: payload.userId,
                deviceId: payload.deviceId,
              });
              targetId = match?.id;
            }

            todoCommands.push({
              action_type: mappedType ?? "create",
              confidence: action.confidence,
              target_hint: action.target_hint,
              target_id: targetId,
              todo: mappedType === "create" ? {
                text: action.changes?.text ?? action.original_text,
                scheduled_start: action.changes?.scheduled_start,
                priority: action.changes?.priority,
              } : undefined,
              changes: mappedType === "modify" ? action.changes as any : undefined,
            });
          }

          result.todo_commands = todoCommands;
          if (actionResults.length > 0) {
            result.action_results = actionResults;
          }
        }
      } catch (err: any) {
        console.error(`[process] Layer 2 failed: ${err.message}`);
        result.error = `指令执行失败: ${err.message}`;
      }
      if (payload.recordId) {
        await recordRepo.updateStatus(payload.recordId, "completed");
      }
      console.log(`[process][⏱ layer2-total] ${Date.now() - t0}ms`);
      return result;
    }

    // ── Layer 3: 统一 AI 调用（v3: Record 为原子单位，不再拆解 Strike）──
    console.log(`[process] Layer 3: Unified AI processing (v3 no-strike)`);

    // 1. 加载上下文
    const [pendingTodosL3, activeGoalsL3, existingDomains] = await Promise.all([
      payload.userId
        ? todoRepo.findPendingByUser(payload.userId)
        : todoRepo.findPendingByDevice(payload.deviceId),
      payload.userId
        ? todoRepo.findActiveGoalsByUser(payload.userId)
        : todoRepo.findActiveGoalsByDevice(payload.deviceId),
      payload.userId
        ? recordRepo.listUserDomains(payload.userId)
        : Promise.resolve([] as string[]),
    ]);

    const unifiedCtx: UnifiedProcessContext = {
      activeGoals: activeGoalsL3.slice(0, 20).map(g => ({ id: g.id, title: g.text })),
      pendingTodos: pendingTodosL3.slice(0, 20).map(t => ({
        id: t.id,
        text: t.text,
        scheduled_start: t.scheduled_start ?? undefined,
      })),
      existingDomains,
    };

    // 2. 单次 AI 调用
    const unifiedPrompt = buildUnifiedProcessPrompt(unifiedCtx);
    const messages: ChatMessage[] = [
      { role: "system", content: unifiedPrompt },
      { role: "user", content: payload.text },
    ];

    const dynamicTimeout = Math.min(300_000, 60_000 + Math.floor(payload.text.length / 1000) * 20_000);
    const tUnified = Date.now();
    const response = await chatCompletion(messages, {
      json: true,
      temperature: 0.3,
      timeout: dynamicTimeout,
      tier: "fast",
    });
    console.log(`[process][⏱ unified-ai] ${Date.now() - tUnified}ms`);

    if (!response?.content?.trim()) {
      throw new Error("AI 返回空结果");
    }

    // 3. 解析结果
    interface UnifiedResult {
      intent_type?: string;
      summary?: string;
      domain?: string | null;
      tags?: string[];
      todos?: Array<{
        text: string;
        scheduled_start?: string;
        priority?: string;
        goal_id?: string | null;
      }>;
      commands?: Array<{
        action_type: string;
        confidence: number;
        target_hint?: string;
        target_id?: string;
        changes?: Record<string, any>;
      }>;
    }

    const parsed = safeParseJson<UnifiedResult>(response.content);
    if (!parsed) {
      throw new Error("AI 返回格式错误");
    }

    const intentType = parsed.intent_type ?? "record";
    result.voice_intent_type = intentType as ProcessResult["voice_intent_type"];
    result.summary = parsed.summary;
    result.tags = parsed.tags;
    console.log(`[process] Result: intent=${intentType}, domain=${parsed.domain ?? "null"}, todos=${parsed.todos?.length ?? 0}, commands=${parsed.commands?.length ?? 0}, tags=${parsed.tags?.length ?? 0}`);

    // 4. 保存 summary
    if (result.summary && payload.recordId) {
      try {
        const existing = await summaryRepo.findByRecordId(payload.recordId);
        if (existing) {
          await summaryRepo.update(payload.recordId, { short_summary: result.summary });
        } else {
          await summaryRepo.create({
            record_id: payload.recordId,
            title: result.summary.slice(0, 50),
            short_summary: result.summary,
          });
        }
      } catch (err: any) {
        console.warn(`[process] Summary save failed: ${err.message}`);
      }
    }

    // 5. domain 分配已移除（Phase 11: Wiki Page 统一组织层）

    // 6. 保存 tags → record_tag（最多5个）
    if (parsed.tags && parsed.tags.length > 0 && payload.recordId) {
      for (const label of parsed.tags.slice(0, 5)) {
        try {
          const tag = await tagRepo.upsert(label);
          await tagRepo.addToRecord(payload.recordId, tag.id);
        } catch {
          // tag 写入失败不阻塞
        }
      }
    }

    // 7. 创建 todos（直接从 AI 输出创建，不经过 Strike 投影）
    if (parsed.todos && parsed.todos.length > 0) {
      for (const t of parsed.todos) {
        try {
          await todoRepo.dedupCreate({
            text: t.text,
            user_id: payload.userId,
            device_id: payload.deviceId,
            record_id: payload.recordId,
            scheduled_start: t.scheduled_start,
            priority: t.priority === "high" ? 5 : t.priority === "medium" ? 3 : t.priority === "low" ? 1 : undefined,
            parent_id: t.goal_id ?? undefined,
          });
        } catch (err: any) {
          console.warn(`[process] Todo create failed: ${err.message}`);
        }
      }
    }

    // 8. 处理指令（仅 action 时，mixed 已废弃 → 归入 record）
    // 按页面上下文过滤可用的 command 类型
    const whitelist = DEFAULT_COMMAND_WHITELIST[payload.sourceContext ?? "timeline"] ?? ["create_todo", "modify_todo"];
    const filteredCommands = (parsed.commands ?? []).filter(cmd => whitelist.includes(cmd.action_type));

    if (intentType === "action" && filteredCommands.length > 0) {
      const actionResults: ActionExecResult[] = [];
      for (const cmd of filteredCommands) {
        try {
          const actionResult = await executeVoiceAction(
            {
              type: cmd.action_type as any,
              confidence: cmd.confidence,
              target_hint: cmd.target_hint ?? "",
              changes: cmd.changes,
              risk_level: "low",
              original_text: payload.text,
            },
            {
              userId: payload.userId,
              deviceId: payload.deviceId,
              recordId: payload.recordId,
            },
          );
          actionResults.push(actionResult);
        } catch (err: any) {
          console.warn(`[process] Command execution failed: ${err.message}`);
        }
      }
      result.action_results = actionResults;

      // 转为 todo_commands 格式，供 CommandSheet 显示
      result.todo_commands = filteredCommands.map(cmd => ({
        action_type: cmd.action_type as any,
        confidence: cmd.confidence,
        target_hint: cmd.target_hint,
        target_id: cmd.target_id,
        changes: cmd.changes as any,
      }));
    }

    // 9. Update record status
    if (payload.recordId) {
      await recordRepo.updateStatus(payload.recordId, "completed");
    }

    // 10. Append to daily diary
    const timeTag = toLocalDateTime(new Date()).split(" ")[1] ?? "00:00";
    const diaryLine = result.summary
      ? `[${timeTag}] ${result.summary}`
      : `[${timeTag}] ${payload.text.slice(0, 200)}`;
    const diaryNotebook = payload.notebook && payload.notebook !== "ai-self" ? payload.notebook : "default";
    appendToDiary(payload.deviceId, diaryNotebook, diaryLine, payload.userId).catch((e) => {
      console.warn("[process] Diary append failed:", e.message);
    });
  } catch (err: any) {
    console.error(`[process] Fatal error processing record ${payload.recordId ?? "N/A"}:`, err);

    if (payload.recordId) {
      try {
        await recordRepo.updateStatus(payload.recordId, "error");
      } catch {
        console.error("[process] Also failed to update record status to error");
      }
    }

    result.error = err.message;
  }

  return result;
}

// ── Layer 1: 待办全能模式 ─────────────────────────────────────────

async function todoFullMode(payload: ProcessPayload): Promise<{
  commands: TodoCommand[];
  actionResults: ActionExecResult[];
}> {
  // 1. 加载上下文：用户未完成待办 + 活跃目标
  const [pendingTodos, activeGoals] = await Promise.all([
    payload.userId
      ? todoRepo.findPendingByUser(payload.userId)
      : todoRepo.findPendingByDevice(payload.deviceId),
    payload.userId
      ? todoRepo.findActiveGoalsByUser(payload.userId)
      : todoRepo.findActiveGoalsByDevice(payload.deviceId),
  ]);

  const ctx: TodoModeContext = {
    pendingTodos: pendingTodos.slice(0, 30).map(t => ({
      id: t.id,
      text: t.text,
      scheduled_start: t.scheduled_start ?? undefined,
    })),
    activeGoals: activeGoals.slice(0, 20).map(g => ({
      id: g.id,
      title: g.text,
    })),
  };

  // 2. AI 提取
  const prompt = buildTodoExtractPrompt(ctx);
  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: payload.text },
  ];

  const t1 = Date.now();
  const response = await chatCompletion(messages, {
    json: true,
    temperature: 0.2,
    timeout: 15000,
    tier: "fast",
  });
  console.log(`[process][⏱ todo-extract-ai] ${Date.now() - t1}ms`);

  if (!response?.content) {
    throw new Error("AI 返回空结果");
  }

  const parsed = safeParseJson<{ commands?: TodoCommand[] }>(response.content);
  if (!parsed?.commands || !Array.isArray(parsed.commands)) {
    throw new Error("AI 返回格式错误");
  }

  const commands: TodoCommand[] = parsed.commands;
  const actionResults: ActionExecResult[] = [];

  // 3. 处理 query 类型：后端查询填充结果
  for (const cmd of commands) {
    if (cmd.action_type === "query" && cmd.query_params) {
      const todos = payload.userId
        ? await todoRepo.findPendingByUser(payload.userId)
        : await todoRepo.findPendingByDevice(payload.deviceId);

      let filtered = todos;

      // 按日期过滤
      if (cmd.query_params.date) {
        filtered = filtered.filter(t => {
          if (!t.scheduled_start) return false;
          return t.scheduled_start.startsWith(cmd.query_params!.date!);
        });
      }

      // 按目标过滤
      if (cmd.query_params.goal_id) {
        filtered = filtered.filter(t => (t as any).goal_id === cmd.query_params!.goal_id);
      }

      // 按状态过滤
      if (cmd.query_params.status === "done") {
        const allTodos = payload.userId
          ? await todoRepo.findByUser(payload.userId)
          : await todoRepo.findByDevice(payload.deviceId);
        filtered = allTodos.filter(t => t.done);
      }

      cmd.query_result = filtered.slice(0, 10).map(t => ({
        id: t.id,
        text: t.text,
        scheduled_start: t.scheduled_start ?? undefined,
        done: t.done,
        priority: t.priority,
      }));
    }

    // 处理 complete/modify 的 target_id 匹配
    if ((cmd.action_type === "complete" || cmd.action_type === "modify") && cmd.target_hint && !cmd.target_id) {
      // 从待办列表中模糊匹配
      const match = pendingTodos.find(t =>
        t.text.includes(cmd.target_hint!) ||
        cmd.target_hint!.split("").some(char => t.text.includes(char))
      );
      if (match) {
        cmd.target_id = match.id;
      }
    }

    // 为 goal_hint 匹配实际 goal_id（create 时用）
    if (cmd.action_type === "create" && cmd.todo?.goal_hint) {
      const matchedGoal = activeGoals.find(g =>
        g.text === cmd.todo!.goal_hint || g.text.includes(cmd.todo!.goal_hint!)
      );
      if (matchedGoal) {
        (cmd.todo as any)._matched_goal_id = matchedGoal.id;
      }
    }
  }

  return { commands, actionResults };
}

/**
 * 修改已识别的待办指令 — 用户在 CommandSheet 中输入文字修改
 */
export async function refineTodoCommands(
  currentCommands: TodoCommand[],
  modificationText: string,
): Promise<TodoCommand[]> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildTodoRefinePrompt(currentCommands) },
    { role: "user", content: modificationText },
  ];

  const response = await chatCompletion(messages, { json: true, temperature: 0.2, timeout: 15000, tier: "fast" });
  if (!response?.content) return currentCommands;

  const parsed = safeParseJson<{ commands?: TodoCommand[] }>(response.content);
  if (!parsed?.commands || !Array.isArray(parsed.commands)) {
    console.error("[refine] Failed to parse refine response:", response.content.slice(0, 200));
    return currentCommands;
  }

  return parsed.commands;
}
