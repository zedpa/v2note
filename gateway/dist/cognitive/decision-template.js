/**
 * 决策模板涌现
 * - detectClosedLoops: 检测完整决策闭环（goal 完成 + todo 全完成）
 * - saveTemplate: 保存决策模板
 * - matchTemplate: 语义匹配已有模板
 */
import { query, queryOne } from "../db/pool.js";
/**
 * 检测最近完成/归档的 goal，且所有关联 todo 已完成，尚未保存为模板。
 */
export async function detectClosedLoops(userId) {
    // 找最近 completed/abandoned 的 goal + 其 todo 统计
    const goals = await query(`SELECT g.id, g.title, g.status,
            COUNT(t.id) FILTER (WHERE t.done = true)::text as completed_todos,
            COUNT(t.id)::text as total_todos
     FROM goal g
     LEFT JOIN todo t ON t.goal_id = g.id
     WHERE g.user_id = $1
       AND g.status IN ('completed', 'abandoned')
       AND g.updated_at >= NOW() - INTERVAL '30 days'
     GROUP BY g.id, g.title, g.status
     HAVING COUNT(t.id) >= 2 AND COUNT(t.id) FILTER (WHERE t.done = true) = COUNT(t.id)
     ORDER BY g.updated_at DESC
     LIMIT 5`, [userId]);
    if (goals.length === 0)
        return [];
    // 排除已有模板的 goal
    const goalIds = goals.map((g) => g.id);
    const existingTemplates = await query(`SELECT id, goal_id FROM decision_template WHERE goal_id = ANY($1)`, [goalIds]);
    const templatedGoalIds = new Set(existingTemplates.map((t) => t.goal_id));
    return goals
        .filter((g) => !templatedGoalIds.has(g.id))
        .map((g) => ({
        goalId: g.id,
        title: g.title,
        completedTodos: parseInt(g.completed_todos, 10),
        totalTodos: parseInt(g.total_todos, 10),
    }));
}
export async function saveTemplate(input) {
    const row = await queryOne(`INSERT INTO decision_template (user_id, goal_id, title, steps, outcome, tags)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id`, [
        input.userId,
        input.goalId,
        input.title,
        JSON.stringify(input.steps),
        input.outcome ?? null,
        input.tags ?? [],
    ]);
    return row.id;
}
/**
 * 通过关键词匹配查找相似的决策模板。
 */
export async function matchTemplate(userId, text) {
    // 简单方案：全文搜索 title 匹配
    // 未来可用 embedding 提升精度
    const keywords = text
        .replace(/[，。！？、；：""''（）\s]/g, "")
        .match(/.{2,4}/g) ?? [];
    if (keywords.length === 0)
        return [];
    // 用 LIKE 搜索（简单方案）
    const likeConditions = keywords
        .slice(0, 5)
        .map((_, i) => `dt.title LIKE '%' || $${i + 2} || '%'`)
        .join(" OR ");
    const templates = await query(`SELECT dt.id, dt.title, dt.steps::text, dt.outcome
     FROM decision_template dt
     WHERE dt.user_id = $1
       AND (${likeConditions || "false"})
     ORDER BY dt.created_at DESC
     LIMIT 3`, [userId, ...keywords.slice(0, 5)]);
    return templates.map((t) => {
        let steps = [];
        try {
            steps = JSON.parse(t.steps);
        }
        catch { /* */ }
        return {
            id: t.id,
            title: t.title,
            steps,
            outcome: t.outcome,
        };
    });
}
//# sourceMappingURL=decision-template.js.map