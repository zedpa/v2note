/**
 * Goal Lifecycle — 健康度计算、状态流转、行动事件、时间线
 *
 * 注：原 computeGoalHealth / getGoalTimeline 依赖 strike/bond 表，
 * 已随 strike 系统清理而简化。未来可基于 wiki_page 重建。
 */

import * as goalRepo from "../db/repositories/goal.js";
import { query, execute } from "../db/pool.js";
import type { Goal } from "../db/repositories/goal.js";

// ── 健康度四维计算 ────────────────────────────────────────────────────

export interface GoalHealth {
  direction: number;
  resource: number;
  path: number;
  drive: number;
}

/**
 * 计算目标健康度四维分数。
 * 原实现依赖 strike/bond cluster，已移除。
 * 当前仅返回 todo 完成率（path 维度），其余维度归零。
 */
export async function computeGoalHealth(goalId: string): Promise<GoalHealth | null> {
  const goal = await goalRepo.findById(goalId);
  if (!goal) return null;

  const todos = await goalRepo.findWithTodos(goalId);
  const doneCount = todos.filter((t) => t.done).length;
  const todoTotal = todos.length;

  return {
    direction: 0,
    resource: 0,
    path: todoTotal > 0 ? Math.round((doneCount / todoTotal) * 100) : 0,
    drive: 0,
  };
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

export async function updateGoalStatus(
  goalId: string,
  event: GoalEvent,
): Promise<void> {
  const goal = await goalRepo.findById(goalId);
  if (!goal) return;

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
 * 获取目标关联的日记时间线。
 * 原实现通过 cluster → strike → record 追溯，已移除。
 * 未来可通过 wiki_page_record 重建。
 */
export async function getGoalTimeline(_goalId: string): Promise<TimelineEntry[]> {
  return [];
}
