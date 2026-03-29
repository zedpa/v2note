/**
 * 目标自动关联模块
 * - goalAutoLink: 创建后全量扫描（cluster + 历史记录 + todo）
 * - linkNewStrikesToGoals: digest 后增量关联新 Strike 到已有目标
 * - getProjectProgress: 项目级子目标进度汇总
 */
import * as goalRepo from "../db/repositories/goal.js";
import * as todoRepo from "../db/repositories/todo.js";
import { query } from "../db/pool.js";
const CLUSTER_LINK_THRESHOLD = 0.7;
const TODO_LINK_THRESHOLD = 0.65;
const STRIKE_GOAL_LINK_THRESHOLD = 0.6;
/**
 * 目标创建后全量关联扫描：
 * 1. 语义匹配 Cluster → 关联
 * 2. 统计相关历史记录数
 * 3. 匹配已有 pending todo → 关联到目标
 */
export async function goalAutoLink(goalId, userId) {
    const result = { clusterLinked: false, recordsFound: 0, todosLinked: 0 };
    const goal = await goalRepo.findById(goalId);
    if (!goal)
        return result;
    // 1. 关联 Cluster（如果还没有）
    if (!goal.cluster_id) {
        try {
            const clusters = await query(`SELECT s.id,
                1 - (s.embedding <=> (
                  SELECT embedding FROM strike
                  WHERE nucleus = $1 AND user_id = $2
                  ORDER BY created_at DESC LIMIT 1
                )) as similarity
         FROM strike s
         WHERE s.user_id = $2 AND s.is_cluster = true AND s.status = 'active'
           AND s.embedding IS NOT NULL
         ORDER BY similarity DESC
         LIMIT 1`, [goal.title, userId]);
            if (clusters.length > 0 && clusters[0].similarity >= CLUSTER_LINK_THRESHOLD) {
                await goalRepo.update(goalId, { cluster_id: clusters[0].id });
                result.clusterLinked = true;
            }
        }
        catch {
            // embedding 不可用时跳过
        }
    }
    else {
        result.clusterLinked = true;
    }
    // 2. 统计相关记录数（通过 Strike 追溯 source_id）
    try {
        const records = await query(`SELECT DISTINCT s.source_id as id
       FROM strike s
       WHERE s.user_id = $1 AND s.source_id IS NOT NULL
         AND s.status = 'active'
         AND s.embedding IS NOT NULL
         AND 1 - (s.embedding <=> (
           SELECT embedding FROM strike
           WHERE nucleus = $2 AND user_id = $1
           ORDER BY created_at DESC LIMIT 1
         )) > $3
       LIMIT 50`, [userId, goal.title, STRIKE_GOAL_LINK_THRESHOLD]);
        result.recordsFound = records.length;
    }
    catch {
        // 静默
    }
    // 3. 关联语义相关的 pending todo
    try {
        const matchingTodos = await query(`SELECT t.id, t.text,
              1 - (te.embedding <=> (
                SELECT embedding FROM strike
                WHERE nucleus = $1 AND user_id = $2
                ORDER BY created_at DESC LIMIT 1
              )) as similarity
       FROM todo t
       JOIN todo_embedding te ON te.todo_id = t.id
       WHERE t.done = false AND t.goal_id IS NULL
         AND te.embedding IS NOT NULL
       ORDER BY similarity DESC
       LIMIT 10`, [goal.title, userId]);
        for (const todo of matchingTodos) {
            if (todo.similarity >= TODO_LINK_THRESHOLD) {
                await todoRepo.update(todo.id, { goal_id: goalId });
                result.todosLinked++;
            }
        }
    }
    catch {
        // todo_embedding 表可能不存在
    }
    return result;
}
/**
 * digest 后检查新 Strike 是否和已有目标的 Cluster 语义匹配。
 * 匹配度 > 0.6 时将记录标记为目标相关。
 */
export async function linkNewStrikesToGoals(newStrikes, userId) {
    const result = { linked: 0 };
    if (newStrikes.length === 0)
        return result;
    // 获取所有有 cluster 的 active 目标
    const goals = await goalRepo.findActiveByUser(userId);
    const goalsWithCluster = goals.filter((g) => g.cluster_id);
    if (goalsWithCluster.length === 0)
        return result;
    // 批量检查新 Strike 和 goal cluster 的匹配度
    for (const strike of newStrikes) {
        if (!strike.source_id)
            continue;
        try {
            const matches = await query(`SELECT g.id as goal_id,
                1 - (cs.embedding <=> s.embedding) as similarity
         FROM goal g
         JOIN strike cs ON cs.id = g.cluster_id
         JOIN strike s ON s.id = $1
         WHERE g.user_id = $2
           AND g.status IN ('active', 'progressing')
           AND cs.embedding IS NOT NULL
           AND s.embedding IS NOT NULL
         ORDER BY similarity DESC
         LIMIT 1`, [strike.id, userId]);
            if (matches.length > 0 && matches[0].similarity >= STRIKE_GOAL_LINK_THRESHOLD) {
                result.linked++;
            }
        }
        catch {
            // embedding 不可用
        }
    }
    return result;
}
/**
 * 获取项目级目标的子目标进度汇总。
 */
export async function getProjectProgress(projectId, userId) {
    const allGoals = await goalRepo.findByUser(userId);
    const children = allGoals.filter((g) => g.parent_id === projectId);
    let totalTodos = 0;
    let completedTodos = 0;
    const childProgress = [];
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
//# sourceMappingURL=goal-auto-link.js.map