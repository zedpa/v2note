/**
 * Layer 2: 全量指令模式 — commandFullMode
 *
 * 用户上滑触发指令模式时，单次 AI 调用处理全部指令类型。
 * 替代原有的双阶段串行（classifyVoiceIntent + matchTodoByHint/executeVoiceAction）。
 *
 * 预加载待办+目标+文件夹 → 注入 prompt → 单次 AI → 后处理
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { todoRepo, notebookRepo } from "../db/repositories/index.js";
import { safeParseJson } from "../lib/text-utils.js";
import { buildCommandFullPrompt, type CommandFullContext } from "./command-full-prompt.js";
import type { TodoCommand, ExtractedTodo } from "./process.js";
import type { ActionExecResult } from "./voice-action.js";

/** 扩展的指令项类型（兼容 TodoCommand + 新类型） */
export interface CommandItem {
  action_type: string;
  confidence: number;
  target_hint?: string;
  target_id?: string;
  todo?: ExtractedTodo;
  record?: { content: string; notebook?: string };
  changes?: Record<string, any>;
  query_params?: Record<string, any>;
  query_result?: any[];
  folder?: { action: "create" | "rename" | "delete"; name: string; new_name?: string };
  move?: { record_hint: string; target_folder: string };
}

interface CommandFullPayload {
  text: string;
  deviceId: string;
  userId?: string;
}

export async function commandFullMode(payload: CommandFullPayload): Promise<{
  commands: CommandItem[];
  actionResults: ActionExecResult[];
}> {
  // 1. 预加载上下文
  const [pendingTodos, activeGoals, notebooks] = await Promise.all([
    payload.userId
      ? todoRepo.findPendingByUser(payload.userId)
      : todoRepo.findPendingByDevice(payload.deviceId),
    payload.userId
      ? todoRepo.findActiveGoalsByUser(payload.userId)
      : todoRepo.findActiveGoalsByDevice(payload.deviceId),
    payload.userId
      ? notebookRepo.findByUser(payload.userId)
      : notebookRepo.findByDevice(payload.deviceId),
  ]);

  const ctx: CommandFullContext = {
    pendingTodos: pendingTodos.slice(0, 30).map(t => ({
      id: t.id,
      text: t.text,
      scheduled_start: t.scheduled_start ?? undefined,
    })),
    activeGoals: activeGoals.slice(0, 20).map(g => ({
      id: g.id,
      title: g.text,
    })),
    folders: notebooks
      .filter(n => !n.is_system)
      .map(n => ({ name: n.name })),
  };

  // 2. 构建 prompt + 单次 AI 调用
  const prompt = buildCommandFullPrompt(ctx);
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
  console.log(`[process][⏱ command-full-ai] ${Date.now() - t1}ms`);

  if (!response?.content?.trim()) {
    throw new Error("AI 返回空结果");
  }

  // 3. 解析 commands
  const parsed = safeParseJson<{ commands?: CommandItem[] }>(response.content);
  if (!parsed?.commands || !Array.isArray(parsed.commands)) {
    throw new Error("AI 返回格式错误");
  }

  const commands: CommandItem[] = parsed.commands;
  const actionResults: ActionExecResult[] = [];

  // 4. action_type 映射：AI prompt 用 create_todo 等长名，前端 CommandSheet 用 create 等短名
  const TODO_TYPE_MAP: Record<string, string> = {
    create_todo: "create",
    complete_todo: "complete",
    modify_todo: "modify",
    delete_todo: "delete",
    query_todo: "query",
  };

  // 5. 后处理
  for (const cmd of commands) {
    // query_todo: 使用预加载的待办列表填充结果（避免重复 DB 查询）
    if (cmd.action_type === "query_todo" && cmd.query_params) {
      let filtered = [...pendingTodos];

      // 按日期过滤
      if (cmd.query_params.date) {
        filtered = filtered.filter(t => {
          if (!t.scheduled_start) return false;
          return t.scheduled_start.startsWith(cmd.query_params!.date);
        });
      }

      // 按状态过滤（done 需要额外查询）
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

    // complete_todo/modify_todo/delete_todo 的 target_id 兜底匹配
    if (
      (cmd.action_type === "complete_todo" || cmd.action_type === "modify_todo" || cmd.action_type === "delete_todo") &&
      cmd.target_hint &&
      !cmd.target_id
    ) {
      // 用预加载的列表做子串匹配（比单字符匹配更精确）
      const hintTokens = cmd.target_hint
        .replace(/[的了那个把这]/g, "")
        .split(/[\s,，。、]+/)
        .filter(t => t.length >= 2);

      const match = pendingTodos.find(t =>
        t.text.includes(cmd.target_hint!) ||
        (hintTokens.length > 0 && hintTokens.some(token => t.text.includes(token)))
      );
      if (match) {
        cmd.target_id = match.id;
      }
    }

    // goal_hint 匹配（create_todo）
    if (cmd.action_type === "create_todo" && cmd.todo?.goal_hint) {
      const matchedGoal = activeGoals.find(g =>
        g.text === cmd.todo!.goal_hint || g.text.includes(cmd.todo!.goal_hint!)
      );
      if (matchedGoal) {
        (cmd.todo as any)._matched_goal_id = matchedGoal.id;
      }
    }

    // 映射 action_type：todo 类型用短名（前端兼容），其他类型保持原值
    if (TODO_TYPE_MAP[cmd.action_type]) {
      cmd.action_type = TODO_TYPE_MAP[cmd.action_type];
    }
  }

  return { commands, actionResults };
}
