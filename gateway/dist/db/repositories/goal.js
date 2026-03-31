/**
 * Goal 适配层 — 统一模型过渡期
 *
 * 所有查询已切换到 todo 表（level>=1），对外接口保持不变。
 * Goal interface 的 title 映射自 todo.text。
 * 调用方无需修改，等所有模块逐步切换到 todoRepo 后可删除此文件。
 */
import { query, queryOne, execute } from "../pool.js";
/** SQL: todo → Goal 字段映射 */
const SELECT_AS_GOAL = `
  SELECT id, device_id, user_id, text AS title, parent_id, status,
         COALESCE(category, 'speech') AS source, cluster_id,
         created_at, COALESCE(updated_at, created_at) AS updated_at
  FROM todo
  WHERE level >= 1
`;
export async function findActiveByDevice(deviceId) {
    return query(`${SELECT_AS_GOAL} AND device_id = $1 AND status IN ('active', 'progressing')
     ORDER BY created_at DESC`, [deviceId]);
}
export async function findActiveByUser(userId) {
    return query(`${SELECT_AS_GOAL} AND user_id = $1 AND status IN ('active', 'progressing')
     ORDER BY created_at DESC`, [userId]);
}
export async function findByUser(userId) {
    return query(`${SELECT_AS_GOAL} AND user_id = $1 ORDER BY created_at DESC`, [userId]);
}
export async function findByDevice(deviceId) {
    return query(`${SELECT_AS_GOAL} AND device_id = $1 ORDER BY created_at DESC`, [deviceId]);
}
export async function findById(id) {
    return queryOne(`SELECT id, device_id, text AS title, parent_id, status,
            COALESCE(category, 'speech') AS source, cluster_id,
            created_at, COALESCE(updated_at, created_at) AS updated_at
     FROM todo WHERE id = $1 AND level >= 1`, [id]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO todo (device_id, user_id, text, parent_id, category, status, level, done)
     VALUES ($1, $2, $3, $4, $5, $6, 1, false)
     RETURNING id, device_id, text AS title, parent_id, status,
               COALESCE(category, 'speech') AS source, cluster_id,
               created_at, COALESCE(updated_at, created_at) AS updated_at`, [
        fields.device_id,
        fields.user_id ?? null,
        fields.title,
        fields.parent_id ?? null,
        fields.source ?? "speech",
        fields.status ?? "active",
    ]);
    return row;
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.title !== undefined) {
        sets.push(`text = $${i++}`);
        params.push(fields.title);
    }
    if (fields.status !== undefined) {
        sets.push(`status = $${i++}`);
        params.push(fields.status);
        // 同步 done 字段
        sets.push(`done = $${i++}`);
        params.push(fields.status === "completed");
    }
    if (fields.parent_id !== undefined) {
        sets.push(`parent_id = $${i++}`);
        params.push(fields.parent_id);
    }
    if (fields.cluster_id !== undefined) {
        sets.push(`cluster_id = $${i++}`);
        params.push(fields.cluster_id);
    }
    if (sets.length === 0)
        return;
    sets.push(`updated_at = now()`);
    params.push(id);
    await execute(`UPDATE todo SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
/** 批量更新 cluster_id 引用（聚类合并时用） */
export async function updateClusterRef(oldClusterId, newClusterId) {
    await execute(`UPDATE todo SET cluster_id = $1 WHERE cluster_id = $2 AND level >= 1`, [newClusterId, oldClusterId]);
}
export async function findWithTodos(goalId) {
    return query(`SELECT id, text, done FROM todo WHERE parent_id = $1 AND level = 0 ORDER BY created_at`, [goalId]);
}
/** 批量查询多个目标的子 todo（一次 SQL 替代 N 次查询） */
export async function findTodosByGoalIds(goalIds) {
    if (goalIds.length === 0)
        return [];
    return query(`SELECT parent_id, id, text, done, completed_at
     FROM todo WHERE parent_id = ANY($1) AND level = 0
     ORDER BY created_at`, [goalIds]);
}
//# sourceMappingURL=goal.js.map