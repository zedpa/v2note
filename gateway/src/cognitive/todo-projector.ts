/**
 * Todo-Strike 数据桥梁 + 智能待办投影
 * intend Strike → todo/goal 投影、粒度判断、时间/优先级提取、重复检测
 * 回补关联、goal-cluster 关联、双向一致性、archive 保护
 */

import * as todoRepo from "../db/repositories/todo.js";
import * as strikeRepo from "../db/repositories/strike.js";
import * as goalRepo from "../db/repositories/goal.js";
import { query, queryOne } from "../db/pool.js";
import { chatCompletion } from "../ai/provider.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Todo } from "../db/repositories/todo.js";
import type { Goal } from "../db/repositories/goal.js";

const MIN_SALIENCE = 0.1;
const COMPLETED_SALIENCE_FACTOR = 0.3;
const BACKFILL_SIMILARITY_THRESHOLD = 0.7;
const DUPLICATE_KEYWORD_THRESHOLD = 0.5; // 关键词重叠 > 50% 视为重复

// ── 优先级映射 ────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, number> = {
  high: 5,
  medium: 3,
  low: 1,
};

// ── parseIntendField: 从 Strike.field 提取结构化信息 ──────────────────

export interface ParsedIntendField {
  granularity: "action" | "goal" | "project";
  scheduled_start?: string;
  scheduled_end?: string;
  person?: string;
  priority: number;
}

/**
 * 解析 intend Strike 的 field 对象，提取时间/人物/优先级/粒度。
 */
export function parseIntendField(field: Record<string, any>): ParsedIntendField {
  return {
    granularity: field.granularity ?? "action",
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
  // 按 2-4 字 ngram 提取 + 按人名/实体词保留
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

// ── intend Strike 投影（支持粒度判断） ────────────────────────────────

/**
 * 将 intend Strike 投影为 todo 或 goal。
 * - action → 创建 todo
 * - goal → 创建 goal + 自动关联 cluster/todo（B2 快路径）
 * - project → 创建 goal + AI 生成子目标建议（B3 快路径）
 */
export async function projectIntendStrike(
  strike: StrikeEntry,
  userId?: string,
): Promise<Todo | Goal | null> {
  if (strike.polarity !== "intend") return null;
  if (!strike.source_id) return null;

  const parsed = parseIntendField(strike.field ?? {});
  const uid = userId ?? strike.user_id;

  if (parsed.granularity === "goal" || parsed.granularity === "project") {
    // B2/B3: 检查同方向是否已有 active goal（关键词重叠检测）
    const existingGoals = await goalRepo.findActiveByUser(uid);
    const duplicate = findDuplicateGoal(strike.nucleus, existingGoals);
    if (duplicate) {
      // 不新建，返回已有 goal
      return duplicate;
    }

    // 创建 goal (source=explicit 因为来自用户明确表达)
    const goal = await goalRepo.create({
      device_id: uid,
      user_id: uid,
      title: strike.nucleus,
      source: "explicit",
    });

    // 自动关联 cluster（通过 embedding 匹配）
    await linkNewGoalToCluster(goal.id, uid);

    // B3: 项目级 → AI 生成子目标建议
    if (parsed.granularity === "project") {
      await generateSubGoalSuggestions(goal, uid);
    }

    return goal;
  }

  // action（默认）→ 创建 todo
  const createFields: Parameters<typeof todoRepo.create>[0] = {
    record_id: strike.source_id,
    text: strike.nucleus,
    strike_id: strike.id,
  };

  const todo = await todoRepo.create(createFields);

  // 写入时间/优先级等结构化字段
  const updateFields: Parameters<typeof todoRepo.update>[1] = {};
  if (parsed.scheduled_start) updateFields.scheduled_start = parsed.scheduled_start;
  if (parsed.scheduled_end) updateFields.scheduled_end = parsed.scheduled_end;
  if (parsed.priority !== 3) updateFields.priority = parsed.priority;

  if (Object.keys(updateFields).length > 0) {
    await todoRepo.update(todo.id, updateFields);
  }

  return todo;
}

// ── 同方向 goal 重复检测 ──────────────────────────────────────────────

function findDuplicateGoal(nucleus: string, goals: Goal[]): Goal | null {
  if (goals.length === 0) return null;
  const newKeywords = extractKeywords(nucleus);
  if (newKeywords.size === 0) return null;

  for (const goal of goals) {
    const goalKeywords = extractKeywords(goal.title);
    if (goalKeywords.size === 0) continue;
    const intersection = new Set([...newKeywords].filter((k) => goalKeywords.has(k)));
    const overlap = intersection.size / Math.min(newKeywords.size, goalKeywords.size);
    if (overlap >= DUPLICATE_KEYWORD_THRESHOLD) return goal;
  }
  return null;
}

// ── 新 goal 自动关联 cluster ──────────────────────────────────────────

async function linkNewGoalToCluster(goalId: string, userId: string): Promise<void> {
  try {
    const matches = await query<{ id: string; similarity: number }>(
      `SELECT s.id,
              1 - (s.embedding <=> (SELECT embedding FROM strike WHERE id = (SELECT strike_id FROM todo WHERE goal_id = $1 LIMIT 1))) as similarity
       FROM strike s
       WHERE s.user_id = $2 AND s.is_cluster = true AND s.status = 'active'
       ORDER BY similarity DESC
       LIMIT 1`,
      [goalId, userId],
    );

    if (matches.length > 0 && matches[0].similarity >= BACKFILL_SIMILARITY_THRESHOLD) {
      await goalRepo.update(goalId, { cluster_id: matches[0].id });
    }
  } catch {
    // embedding 不可用时静默跳过
  }
}

// ── B3: AI 生成子目标建议 ─────────────────────────────────────────────

async function generateSubGoalSuggestions(parentGoal: Goal, userId: string): Promise<void> {
  try {
    const resp = await chatCompletion(
      [
        {
          role: "system",
          content: `用户表达了一个项目级目标。请分析并建议 2-4 个子目标，帮助用户拆解这个大方向。

返回 JSON：
{"sub_goals": [{"title": "子目标标题", "reason": "为什么需要这个子目标"}]}

要求：
- 每个子目标应该是可独立追踪的
- 按逻辑顺序排列
- 标题简洁明确`,
        },
        { role: "user", content: `项目目标：${parentGoal.title}` },
      ],
      { json: true, temperature: 0.3 },
    );

    const parsed = JSON.parse(resp.content);
    const subGoals = parsed.sub_goals ?? [];

    for (const sub of subGoals) {
      if (!sub.title) continue;
      await goalRepo.create({
        device_id: userId,
        user_id: userId,
        title: sub.title,
        parent_id: parentGoal.id,
        source: "explicit",
        status: "suggested",
      });
    }
  } catch (err) {
    console.error("[todo-projector] Sub-goal generation failed:", err);
    // 项目 goal 已创建，子目标生成失败不影响主流程
  }
}

// ── 回补关联 ──────────────────────────────────────────────────────────

/**
 * 批量回补：对无 strike_id 的 todo，用 embedding 匹配最相关的 intend Strike。
 */
export async function backfillTodoStrikes(
  userId: string,
): Promise<{ linked: number; skipped: number }> {
  const allTodos = await todoRepo.findPendingByUser(userId);
  const todosWithoutStrike = allTodos.filter((t: any) => !t.strike_id);

  if (todosWithoutStrike.length === 0) return { linked: 0, skipped: 0 };

  let linked = 0;
  let skipped = 0;

  for (const todo of todosWithoutStrike) {
    try {
      const matches = await query<{ strike_id: string; similarity: number }>(
        `SELECT s.id as strike_id,
                1 - (s.embedding <=> (SELECT embedding FROM todo_embedding WHERE todo_id = $1)) as similarity
         FROM strike s
         WHERE s.user_id = $2 AND s.polarity = 'intend' AND s.status = 'active'
         ORDER BY similarity DESC
         LIMIT 1`,
        [todo.id, userId],
      );

      if (matches.length > 0 && matches[0].similarity >= BACKFILL_SIMILARITY_THRESHOLD) {
        await todoRepo.update(todo.id, { strike_id: matches[0].strike_id });
        linked++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return { linked, skipped };
}

// ── goal 关联 Cluster ─────────────────────────────────────────────────

export async function linkGoalsToClusters(
  userId: string,
): Promise<{ linked: number }> {
  const goals = await goalRepo.findActiveByUser(userId);
  const goalsWithoutCluster = goals.filter((g: any) => !g.cluster_id);

  if (goalsWithoutCluster.length === 0) return { linked: 0 };

  let linked = 0;

  for (const goal of goalsWithoutCluster) {
    try {
      const matches = await query<{ id: string; similarity: number }>(
        `SELECT s.id,
                1 - (s.embedding <=> (SELECT embedding FROM goal_embedding WHERE goal_id = $1)) as similarity
         FROM strike s
         WHERE s.user_id = $2 AND s.is_cluster = true AND s.status = 'active'
         ORDER BY similarity DESC
         LIMIT 1`,
        [goal.id, userId],
      );

      if (matches.length > 0 && matches[0].similarity >= BACKFILL_SIMILARITY_THRESHOLD) {
        await goalRepo.update(goal.id, { cluster_id: matches[0].id });
        linked++;
      }
    } catch {
      // embedding 表可能不存在，跳过
    }
  }

  return { linked };
}

// ── 双向一致性 ────────────────────────────────────────────────────────

export async function onTodoComplete(todoId: string): Promise<void> {
  const todo = await queryOne<{
    id: string;
    strike_id: string | null;
    goal_id: string | null;
    done: boolean;
  }>(`SELECT id, strike_id, goal_id, done FROM todo WHERE id = $1`, [todoId]);

  if (!todo || !todo.strike_id) return;

  const strike = await strikeRepo.findById(todo.strike_id);
  if (strike) {
    const newSalience = Math.max(
      MIN_SALIENCE,
      strike.salience * COMPLETED_SALIENCE_FACTOR,
    );
    await strikeRepo.update(strike.id, { salience: newSalience });
  }

  if (todo.goal_id) {
    await goalRepo.findWithTodos(todo.goal_id);
  }
}

// ── Strike 删除保护 ──────────────────────────────────────────────────

export async function guardStrikeArchive(strikeId: string): Promise<boolean> {
  const activeTodos = await query<{ id: string; done: boolean }>(
    `SELECT id, done FROM todo WHERE strike_id = $1 AND done = false`,
    [strikeId],
  );

  return activeTodos.length === 0;
}

export async function enforceMinSalience(strikeId: string): Promise<void> {
  const activeTodos = await query<{ id: string }>(
    `SELECT id FROM todo WHERE strike_id = $1 AND done = false LIMIT 1`,
    [strikeId],
  );

  if (activeTodos.length === 0) return;

  const strike = await strikeRepo.findById(strikeId);
  if (strike && strike.salience < MIN_SALIENCE) {
    await strikeRepo.update(strikeId, { salience: MIN_SALIENCE });
  }
}
