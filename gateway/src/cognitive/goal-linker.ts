/**
 * Goal Lifecycle — 健康度计算、涌现目标、状态流转、行动事件、时间线
 */

import * as goalRepo from "../db/repositories/goal.js";
import { query, execute } from "../db/pool.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Goal } from "../db/repositories/goal.js";

const INTEND_DENSITY_THRESHOLD = 0.3; // 30% intend 密度触发涌现

// ── 健康度四维计算 ────────────────────────────────────────────────────

export interface GoalHealth {
  direction: number;  // intend Strike 占比 × 100
  resource: number;   // perceive Strike 中可用信息数
  path: number;       // 关联 todo 完成比例 × 100
  drive: number;      // feel/judge Strike 数 > 0 ? 计数 : 0
}

/**
 * 计算目标健康度四维分数。
 * 通过 goal.cluster_id → Cluster 成员 Strike 统计。
 */
export async function computeGoalHealth(goalId: string): Promise<GoalHealth | null> {
  const goal = await goalRepo.findById(goalId);
  if (!goal?.cluster_id) return null;

  // 统计 cluster 成员的极性分布
  const polarityStats = await query<{ polarity: string; count: string }>(
    `SELECT s.polarity, COUNT(*)::text as count
     FROM strike s
     JOIN bond b ON (b.source_strike_id = $1 AND b.target_strike_id = s.id)
                 OR (b.target_strike_id = $1 AND b.source_strike_id = s.id)
     WHERE s.status = 'active'
     GROUP BY s.polarity`,
    [goal.cluster_id],
  );

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of polarityStats) {
    const c = parseInt(row.count, 10);
    counts[row.polarity] = c;
    total += c;
  }

  // todo 完成率
  const todos = await goalRepo.findWithTodos(goalId);
  const doneCount = todos.filter((t) => t.done).length;
  const todoTotal = todos.length;

  return {
    direction: total > 0 ? Math.round(((counts["intend"] ?? 0) / total) * 100) : 0,
    resource: counts["perceive"] ?? 0,
    path: todoTotal > 0 ? Math.round((doneCount / todoTotal) * 100) : 0,
    drive: (counts["feel"] ?? 0) + (counts["judge"] ?? 0),
  };
}

// ── 涌现目标检测 ──────────────────────────────────────────────────────

/**
 * 检查 Cluster 的 intend 密度是否超标。
 * 如果是且无已关联 active goal，创建 suggested goal。
 */
export async function checkIntendEmergence(
  cluster: StrikeEntry,
  userId: string,
): Promise<Goal | null> {
  if (!cluster.is_cluster) return null;

  // 统计 cluster 成员中 intend 占比
  const stats = await query<{ total: string; intend_count: string }>(
    `SELECT
       COUNT(*)::text as total,
       COUNT(*) FILTER (WHERE s.polarity = 'intend')::text as intend_count
     FROM strike s
     JOIN bond b ON (b.source_strike_id = $1 AND b.target_strike_id = s.id)
                 OR (b.target_strike_id = $1 AND b.source_strike_id = s.id)
     WHERE s.status = 'active'`,
    [cluster.id],
  );

  const total = parseInt(stats[0]?.total ?? "0", 10);
  const intendCount = parseInt(stats[0]?.intend_count ?? "0", 10);

  if (total === 0 || intendCount / total < INTEND_DENSITY_THRESHOLD) return null;

  // 检查是否已有关联 goal
  const existingGoals = await query<{ id: string }>(
    `SELECT id FROM goal WHERE cluster_id = $1 AND status IN ('active', 'progressing', 'suggested')`,
    [cluster.id],
  );

  if (existingGoals.length > 0) return null;

  // 创建 suggested goal (source=emerged 表示涌现产生)
  const goal = await goalRepo.create({
    device_id: userId,
    user_id: userId,
    title: cluster.nucleus,
    source: "emerged",
  });

  // 关联 cluster
  await goalRepo.update(goal.id, { cluster_id: cluster.id, status: "suggested" });

  return goal;
}

// ── 行动事件 ──────────────────────────────────────────────────────────

export async function createActionEvent(event: {
  todo_id: string;
  type: "complete" | "skip" | "resume";
  reason?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO action_event (todo_id, type, reason) VALUES ($1, $2, $3)`,
    [event.todo_id, event.type, event.reason ?? null],
  );

  // 跳过事件：更新 skip_count，达 3 次触发目标状态转换
  if (event.type === "skip") {
    const rows = await query<{ skip_count: string; goal_id: string | null }>(
      `UPDATE todo SET skip_count = skip_count + 1 WHERE id = $1
       RETURNING skip_count::text, goal_id`,
      [event.todo_id],
    );
    const row = rows[0];
    if (row && Number(row.skip_count) >= 3 && row.goal_id) {
      await updateGoalStatus(row.goal_id, "todo_skipped_3");
    }
  }

  // 完成事件：触发目标状态转换（active→progressing）
  if (event.type === "complete") {
    const rows = await query<{ goal_id: string | null }>(
      `SELECT goal_id FROM todo WHERE id = $1`,
      [event.todo_id],
    );
    if (rows[0]?.goal_id) {
      await updateGoalStatus(rows[0].goal_id, "todo_completed");
    }
  }
}

// ── 状态流转 ──────────────────────────────────────────────────────────

type GoalEvent = "todo_completed" | "todo_skipped_3" | "all_todos_done" | "user_confirm" | "user_archive";

/**
 * 根据事件更新目标状态。
 */
export async function updateGoalStatus(
  goalId: string,
  event: GoalEvent,
): Promise<void> {
  const goal = await goalRepo.findById(goalId);
  if (!goal) return;

  // 终态不可流转
  if (goal.status === "completed" || goal.status === "abandoned") return;

  switch (event) {
    case "todo_completed": {
      if (goal.status === "active" || goal.status === "suggested") {
        await goalRepo.update(goalId, { status: "progressing" });
      }
      break;
    }
    case "todo_skipped_3": {
      if (goal.status === "progressing") {
        // 确认有 todo 跳过 3+ 次
        const skipped = await query<{ skip_count: string }>(
          `SELECT skip_count::text FROM todo WHERE goal_id = $1 AND skip_count >= 3 AND done = false LIMIT 1`,
          [goalId],
        );
        if (skipped.length > 0) {
          await goalRepo.update(goalId, { status: "blocked" });
        }
      }
      break;
    }
    case "all_todos_done": {
      // 不自动 complete，需用户确认
      break;
    }
    case "user_confirm": {
      if (goal.status === "suggested") {
        await goalRepo.update(goalId, { status: "active" });
      }
      break;
    }
    case "user_archive": {
      await goalRepo.update(goalId, { status: "abandoned" });
      break;
    }
  }
}

// ── 目标时间线 ────────────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  source_id: string | null;
  nucleus: string;
  polarity: string;
  created_at: string;
}

/**
 * 获取目标关联的日记时间线（通过 cluster 成员 Strike 追溯）。
 */
export async function getGoalTimeline(goalId: string): Promise<TimelineEntry[]> {
  const goal = await goalRepo.findById(goalId);
  if (!goal?.cluster_id) return [];

  const entries = await query<TimelineEntry>(
    `SELECT s.id, s.source_id, s.nucleus, s.polarity, s.created_at
     FROM strike s
     JOIN bond b ON (b.source_strike_id = $1 AND b.target_strike_id = s.id)
                 OR (b.target_strike_id = $1 AND b.source_strike_id = s.id)
     WHERE s.status = 'active' AND s.source_id IS NOT NULL
     ORDER BY s.created_at ASC`,
    [goal.cluster_id],
  );

  return entries;
}
