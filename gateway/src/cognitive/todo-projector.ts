/**
 * 智能待办投影
 * intend 输入 → todo 创建、时间/优先级提取、重复检测
 */

import * as todoRepo from "../db/repositories/todo.js";
import * as goalRepo from "../db/repositories/goal.js";
import * as recordRepo from "../db/repositories/record.js";
import { queryOne } from "../db/pool.js";
import { eventBus, type TodoCreatedEvent } from "../lib/event-bus.js";
import type { Todo } from "../db/repositories/todo.js";
import { writeTodoEmbedding } from "./embed-writer.js";

const DUPLICATE_KEYWORD_THRESHOLD = 0.5; // 关键词重叠 > 50% 视为重复

// ── 优先级映射 ────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, number> = {
  high: 5,
  medium: 3,
  low: 1,
};

// ── IntendInput: digest 传入的意图数据 ──────────────────────────────────

/** digest 传入的意图结构（替代原 StrikeEntry） */
export interface IntendInput {
  nucleus: string;
  polarity: string;
  source_id?: string | null;
  user_id: string;
  field?: Record<string, any> | null;
}

// ── parseIntendField: 从 field 提取结构化信息 ──────────────────────────

export interface ParsedIntendField {
  scheduled_start?: string;
  scheduled_end?: string;
  person?: string;
  priority: number;
}

/**
 * 解析 intend 的 field 对象，提取时间/人物/优先级。
 * Phase 14.2: granularity 字段已移除，digest 只提取 action 粒度。
 */
export function parseIntendField(field: Record<string, any>): ParsedIntendField {
  return {
    scheduled_start: field.scheduled_start ?? undefined,
    scheduled_end: field.deadline ?? field.scheduled_end ?? undefined,
    person: field.person ?? undefined,
    priority: PRIORITY_MAP[field.priority] ?? 3,
  };
}

// ── 重复检测 ──────────────────────────────────────────────────────────

/**
 * 简单关键词重叠检测：新 todo 文本 vs 已有待办。
 * 返回匹配的已有 todo，或 null。
 */
export async function checkDuplicate(
  text: string,
  userId: string,
): Promise<Pick<Todo, "id" | "text"> | null> {
  const pending = await todoRepo.findPendingByUser(userId);
  if (pending.length === 0) return null;

  const newKeywords = extractKeywords(text);
  if (newKeywords.size === 0) return null;

  let bestMatch: { todo: Pick<Todo, "id" | "text">; overlap: number } | null = null;

  for (const todo of pending) {
    const existingKeywords = extractKeywords(todo.text);
    if (existingKeywords.size === 0) continue;

    const intersection = new Set([...newKeywords].filter((k) => existingKeywords.has(k)));
    const overlap = intersection.size / Math.min(newKeywords.size, existingKeywords.size);

    if (overlap >= DUPLICATE_KEYWORD_THRESHOLD && (!bestMatch || overlap > bestMatch.overlap)) {
      bestMatch = { todo: { id: todo.id, text: todo.text }, overlap };
    }
  }

  return bestMatch?.todo ?? null;
}

/** 提取中文关键词（去掉常见停用词，按字符分词） */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set(["的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "他", "她", "它", "把", "那", "给", "让", "被", "从", "对", "这个", "那个", "什么", "怎么", "可以", "还", "吗", "呢", "吧", "啊", "哦"]);
  const keywords = new Set<string>();
  const cleaned = text.replace(/[，。！？、；：""''（）\s]/g, "");
  // 2-gram
  for (let i = 0; i < cleaned.length - 1; i++) {
    const gram = cleaned.slice(i, i + 2);
    if (!stopWords.has(gram)) keywords.add(gram);
  }
  // 3-gram
  for (let i = 0; i < cleaned.length - 2; i++) {
    const gram = cleaned.slice(i, i + 3);
    keywords.add(gram);
  }
  return keywords;
}

// ── intend 投影 ──────────────────────────────────────────────────────

/**
 * 将 intend 投影为 action todo。
 * Phase 14.2: goal/project 提取已废弃，统一创建 action todo（level=0）。
 * Goal 由 wiki compile 的 goal_sync 创建。
 */
export async function projectIntendStrike(
  input: IntendInput,
  userId?: string,
): Promise<Todo | null> {
  const tp0 = Date.now();
  if (input.polarity !== "intend") return null;
  if (!input.source_id) return null;

  const parsed = parseIntendField(input.field ?? {});
  const uid = userId ?? input.user_id;

  // 获取真实 device_id（从 record 或 device 表）
  let deviceId = uid;
  if (input.source_id) {
    const rec = await recordRepo.findById(input.source_id);
    if (rec?.device_id) deviceId = rec.device_id;
  }

  const matchedGoalId = (input.field as any)?.matched_goal_id ?? undefined;
  const createFields: Parameters<typeof todoRepo.create>[0] = {
    record_id: input.source_id,
    text: input.nucleus,
    user_id: uid,
    device_id: deviceId,
    parent_id: matchedGoalId,
  };

  const { todo, action: dedupAction } = await todoRepo.dedupCreate(createFields);

  if (dedupAction === "matched") {
    console.log(`[todo-projector] Dedup: "${input.nucleus.slice(0, 30)}" matched existing todo ${todo.id}`);
    return todo;
  }

  // 异步写入 embedding
  void writeTodoEmbedding(todo.id, input.nucleus, 0);

  // 写入时间/优先级等结构化字段
  const updateFields: Parameters<typeof todoRepo.update>[1] = {};
  if (parsed.scheduled_start) updateFields.scheduled_start = parsed.scheduled_start;
  if (parsed.scheduled_end) updateFields.scheduled_end = parsed.scheduled_end;
  if (parsed.priority !== 3) updateFields.priority = parsed.priority;

  if (Object.keys(updateFields).length > 0) {
    await todoRepo.update(todo.id, updateFields);
  }

  // 通知前端：待办已创建
  eventBus.emit("todo.created", {
    deviceId,
    userId: uid,
    todoText: input.nucleus,
    todoId: todo.id,
    recordId: input.source_id ?? undefined,
  } satisfies TodoCreatedEvent);

  console.log(`[todo-projector][⏱] ${Date.now() - tp0}ms — created todo "${input.nucleus.slice(0, 30)}" → event emitted`);
  return todo;
}

// ── 完成回调 ────────────────────────────────────────────────────────

export async function onTodoComplete(todoId: string): Promise<void> {
  const todo = await queryOne<{
    id: string;
    goal_id: string | null;
    done: boolean;
  }>(`SELECT id, goal_id, done FROM todo WHERE id = $1`, [todoId]);

  if (!todo) return;

  if (todo.goal_id) {
    await goalRepo.findWithTodos(todo.goal_id);
  }
}
