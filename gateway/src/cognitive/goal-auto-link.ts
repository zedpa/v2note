/**
 * 目标自动关联模块
 * - goalAutoLink: 创建后全量扫描（wiki_page + todo）
 * - linkNewStrikesToGoals: digest 后增量关联（已废弃，保留签名兼容）
 * - getProjectProgress: 项目级子目标进度汇总
 *
 * 注：原 strike/cluster 关联已随 strike 系统清理。
 * cluster 匹配改为基于 wiki_page，todo 匹配改为基于 goal_embedding。
 */

import * as goalRepo from "../db/repositories/goal.js";
import * as todoRepo from "../db/repositories/todo.js";
import { query } from "../db/pool.js";
import type { Goal } from "../db/repositories/goal.js";

const TODO_LINK_THRESHOLD = 0.65;

// ── 场景 1: 全量关联 ─────────────────────────────────────────────────

export interface AutoLinkResult {
  clusterLinked: boolean;
  recordsFound: number;
  todosLinked: number;
}

/**
 * 目标创建后全量关联扫描：
 * 1. 语义匹配 wiki_page → 关联
 * 2. 统计相关历史记录数
 * 3. 匹配已有 pending todo → 关联到目标
 */
export async function goalAutoLink(goalId: string, userId: string): Promise<AutoLinkResult> {
  const result: AutoLinkResult = { clusterLinked: false, recordsFound: 0, todosLinked: 0 };

  const goal = await goalRepo.findById(goalId);
  if (!goal) return result;

  // 1. 关联 wiki_page（如果还没有）
  if (!goal.wiki_page_id) {
    try {
      const pages = await query<{ id: string; similarity: number }>(
        `SELECT wp.id,
                1 - (wp.embedding <=> ge.embedding) as similarity
         FROM wiki_page wp, goal_embedding ge
         WHERE ge.goal_id = $1
           AND wp.user_id = $2 AND wp.status = 'active'
           AND wp.embedding IS NOT NULL AND ge.embedding IS NOT NULL
         ORDER BY similarity DESC
         LIMIT 1`,
        [goalId, userId],
      );

      if (pages.length > 0 && pages[0].similarity >= 0.7) {
        await goalRepo.update(goalId, { wiki_page_id: pages[0].id });
        result.clusterLinked = true;
      }
    } catch {
      // embedding 不可用时跳过
    }
  } else {
    result.clusterLinked = true;
  }

  // 2. 统计相关记录数（通过 wiki_page_record 追溯）
  try {
    const records = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT wpr.record_id) as count
       FROM wiki_page_record wpr
       JOIN wiki_page wp ON wp.id = wpr.wiki_page_id
       WHERE wp.user_id = $1 AND wp.status = 'active'
         AND wp.embedding IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM goal_embedding ge
           WHERE ge.goal_id = $2 AND ge.embedding IS NOT NULL
             AND 1 - (wp.embedding <=> ge.embedding) > 0.6
         )`,
      [userId, goalId],
    );
    result.recordsFound = parseInt(records[0]?.count ?? "0", 10);
  } catch {
    // 静默
  }

  // 3. 关联语义相关的 pending todo
  try {
    const matchingTodos = await query<{ id: string; text: string; similarity: number }>(
      `SELECT t.id, t.text,
              1 - (te.embedding <=> ge.embedding) as similarity
       FROM todo t
       JOIN todo_embedding te ON te.todo_id = t.id
       CROSS JOIN goal_embedding ge
       WHERE ge.goal_id = $1
         AND t.user_id = $2
         AND t.done = false AND t.goal_id IS NULL
         AND te.embedding IS NOT NULL AND ge.embedding IS NOT NULL
       ORDER BY similarity DESC
       LIMIT 10`,
      [goalId, userId],
    );

    for (const todo of matchingTodos) {
      if (todo.similarity >= TODO_LINK_THRESHOLD) {
        await todoRepo.update(todo.id, { goal_id: goalId } as any);
        result.todosLinked++;
      }
    }
  } catch {
    // todo_embedding 表可能不存在
  }

  return result;
}

// ── 场景 2: 增量关联（digest 后） ────────────────────────────────────

export interface IncrementalLinkResult {
  linked: number;
}

/**
 * @deprecated strike 系统已废弃，增量关联改为基于 wiki_page。
 * 保留签名以兼容调用方，实际使用 wiki_page + goal_embedding 匹配。
 */
export async function linkNewStrikesToGoals(
  _newStrikes: Array<{ id: string; source_id: string | null }>,
  userId: string,
): Promise<IncrementalLinkResult> {
  const result: IncrementalLinkResult = { linked: 0 };

  // 获取无 wiki_page_id 的活跃目标
  const allGoals = await goalRepo.findActiveByUser(userId);
  const orphanGoals = allGoals.filter((g) => !g.wiki_page_id && !g.cluster_id);
  if (orphanGoals.length === 0) return result;

  // 对每个孤立目标，用 embedding 匹配最近的活跃 wiki_page
  for (const goal of orphanGoals) {
    try {
      const matches = await query<{ page_id: string; similarity: number }>(
        `SELECT wp.id as page_id,
                1 - (wp.embedding <=> ge.embedding) as similarity
         FROM wiki_page wp, goal_embedding ge
         WHERE ge.goal_id = $1
           AND wp.user_id = $2 AND wp.status = 'active'
           AND wp.embedding IS NOT NULL AND ge.embedding IS NOT NULL
         ORDER BY similarity DESC
         LIMIT 1`,
        [goal.id, userId],
      );

      if (matches.length > 0 && matches[0].similarity >= 0.6) {
        await goalRepo.update(goal.id, { wiki_page_id: matches[0].page_id });
        result.linked++;
      }
    } catch {
      // embedding 不可用
    }
  }

  return result;
}

// ── 场景 4: 项目进度汇总 ─────────────────────────────────────────────

export interface ChildGoalProgress {
  id: string;
  title: string;
  status: string;
  totalTodos: number;
  completedTodos: number;
  completionPercent: number;
}

export interface ProjectProgress {
  children: ChildGoalProgress[];
  totalTodos: number;
  completedTodos: number;
  overallPercent: number;
}

/**
 * 获取项目级目标的子目标进度汇总。
 */
export async function getProjectProgress(projectId: string, userId: string): Promise<ProjectProgress> {
  const allGoals = await goalRepo.findByUser(userId);
  const children = allGoals.filter((g) => g.parent_id === projectId);

  let totalTodos = 0;
  let completedTodos = 0;
  const childProgress: ChildGoalProgress[] = [];

  for (const child of children) {
    const todos = await goalRepo.findWithTodos(child.id);
    const done = todos.filter((t) => t.done).length;
    const total = todos.length;
    totalTodos += total;
    completedTodos += done;

    childProgress.push({
      id: child.id,
      title: child.title,
      status: child.status,
      totalTodos: total,
      completedTodos: done,
      completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  }

  return {
    children: childProgress,
    totalTodos,
    completedTodos,
    overallPercent: totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0,
  };
}
