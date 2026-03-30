/**
 * 行动事件追踪模块
 * - getActionStats: 行为统计（完成率、跳过原因、按目标、时段分布）
 * - getSkipAlerts: 跳过 3+ 次的行动 alert
 * - getResultTrackingPrompts: 完成 7+ 天未跟进的追踪提示
 */

import { query } from "../db/pool.js";

// ── 场景 3: 行为统计 ─────────────────────────────────────────────────

export interface ActionStats {
  totalEvents: number;
  completionRate: number;
  skipReasons: Array<{ reason: string; count: number }>;
  goalStats: Array<{ goalId: string; goalTitle: string; total: number; completed: number }>;
  timeDistribution: Array<{ hour: string; count: number }>;
}

/** 构建 user/device 过滤条件 */
function ownerWhere(opts: { userId?: string; deviceId?: string }): [string, string] {
  if (opts.userId) return ["t.user_id = $1", opts.userId];
  return ["t.device_id = $1", opts.deviceId!];
}

/**
 * 统计过去 N 天的行动事件。
 */
export async function getActionStats(
  opts: { userId?: string; deviceId?: string },
  days: number = 14,
): Promise<ActionStats> {
  const [where, id] = ownerWhere(opts);

  // 1. 事件类型计数（通过 todo.user_id/device_id 直接过滤，不再 JOIN record）
  const typeCounts = await query<{ type: string; count: string }>(
    `SELECT ae.type, COUNT(*)::text as count
     FROM action_event ae
     JOIN todo t ON t.id = ae.todo_id
     WHERE ${where}
       AND ae.created_at >= NOW() - ($2 || ' days')::interval
     GROUP BY ae.type`,
    [id, String(days)],
  );

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of typeCounts) {
    const c = parseInt(row.count, 10);
    counts[row.type] = c;
    total += c;
  }

  // 2. 跳过原因分布
  const skipReasons = await query<{ reason: string; count: string }>(
    `SELECT COALESCE(ae.reason, 'unknown') as reason, COUNT(*)::text as count
     FROM action_event ae
     JOIN todo t ON t.id = ae.todo_id
     WHERE ${where}
       AND ae.type = 'skip'
       AND ae.created_at >= NOW() - ($2 || ' days')::interval
     GROUP BY ae.reason
     ORDER BY count DESC`,
    [id, String(days)],
  );

  // 3. 按目标完成率（goal 已统一为 todo.level>=1，用 parent_id 关联）
  const goalStats = await query<{ goal_id: string; goal_title: string; total: string; completed: string }>(
    `SELECT p.id as goal_id, p.text as goal_title,
            COUNT(ae.id)::text as total,
            COUNT(ae.id) FILTER (WHERE ae.type = 'complete')::text as completed
     FROM action_event ae
     JOIN todo t ON t.id = ae.todo_id
     JOIN todo p ON p.id = t.parent_id AND p.level >= 1
     WHERE ${where}
       AND ae.created_at >= NOW() - ($2 || ' days')::interval
     GROUP BY p.id, p.text
     ORDER BY total DESC`,
    [id, String(days)],
  );

  // 4. 完成时间段分布
  const timeDistribution = await query<{ hour: string; count: string }>(
    `SELECT EXTRACT(HOUR FROM ae.created_at)::text as hour, COUNT(*)::text as count
     FROM action_event ae
     JOIN todo t ON t.id = ae.todo_id
     WHERE ${where}
       AND ae.type = 'complete'
       AND ae.created_at >= NOW() - ($2 || ' days')::interval
     GROUP BY hour
     ORDER BY count DESC`,
    [id, String(days)],
  );

  return {
    totalEvents: total,
    completionRate: total > 0 ? (counts["complete"] ?? 0) / total : 0,
    skipReasons: skipReasons.map((r) => ({ reason: r.reason, count: parseInt(r.count, 10) })),
    goalStats: goalStats.map((g) => ({
      goalId: g.goal_id,
      goalTitle: g.goal_title,
      total: parseInt(g.total, 10),
      completed: parseInt(g.completed, 10),
    })),
    timeDistribution: timeDistribution.map((t) => ({ hour: t.hour, count: parseInt(t.count, 10) })),
  };
}

// ── 场景 4: 跳过 alert ──────────────────────────────────────────────

export interface SkipAlert {
  todoId: string;
  todoText: string;
  skipCount: number;
  goalTitle: string | null;
  description: string;
}

/**
 * 获取 skip_count >= 3 的待办 alert（用于每日回顾注入）。
 */
export async function getSkipAlerts(opts: { userId?: string; deviceId?: string }): Promise<SkipAlert[]> {
  const [where, id] = ownerWhere(opts);
  const rows = await query<{ id: string; text: string; skip_count: string; goal_title: string | null }>(
    `SELECT t.id, t.text, t.skip_count::text,
            p.text as goal_title
     FROM todo t
     LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1
     WHERE ${where}
       AND t.done = false
       AND t.skip_count >= 3
     ORDER BY t.skip_count DESC
     LIMIT 10`,
    [id],
  );

  return rows.map((r) => {
    const skipCount = parseInt(r.skip_count, 10);
    return {
      todoId: r.id,
      todoText: r.text,
      skipCount,
      goalTitle: r.goal_title,
      description: `「${r.text}」已被跳过 ${skipCount} 次${r.goal_title ? `（目标：${r.goal_title}）` : ""}，可能有阻力需要处理。`,
    };
  });
}

// ── 场景 5: 结果追踪提示 ─────────────────────────────────────────────

export interface ResultTrackingPrompt {
  todoId: string;
  todoText: string;
  completedAt: string;
  goalId: string | null;
  goalTitle: string | null;
  prompt: string;
}

/**
 * 查找完成 7+ 天、关联 goal 仍 active 的 todo → 生成追踪提示。
 */
export async function getResultTrackingPrompts(opts: { userId?: string; deviceId?: string }): Promise<ResultTrackingPrompt[]> {
  const [where, id] = ownerWhere(opts);
  const rows = await query<{
    id: string;
    text: string;
    completed_at: string;
    goal_id: string | null;
    goal_title: string | null;
  }>(
    `SELECT t.id, t.text, t.completed_at,
            p.id as goal_id, p.text as goal_title
     FROM todo t
     JOIN todo p ON p.id = t.parent_id AND p.level >= 1 AND p.status IN ('active', 'progressing')
     WHERE ${where}
       AND t.done = true
       AND t.completed_at IS NOT NULL
       AND t.completed_at <= NOW() - INTERVAL '7 days'
       AND t.parent_id IS NOT NULL
     ORDER BY t.completed_at DESC
     LIMIT 5`,
    [id],
  );

  return rows.map((r) => ({
    todoId: r.id,
    todoText: r.text,
    completedAt: r.completed_at,
    goalId: r.goal_id,
    goalTitle: r.goal_title,
    prompt: `「${r.text}」完成一周了，结果怎样？`,
  }));
}
