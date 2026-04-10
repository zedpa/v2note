/**
 * 认知报告生成 — 纯数据聚合，0 AI 调用。
 *
 * v3: 数据源从 strike/bond/cluster 切换到 wiki page + record。
 * 在 daily-cycle 末尾调用，产出结构化报告供晨间/晚间简报使用。
 */
import { query } from "../db/pool.js";
import { today, toLocalDate } from "../lib/tz.js";
export async function generateCognitiveReport(opts) {
    const todayStr = today();
    const [recordWhere, todoWhere, params] = opts.userId
        ? ["user_id = $1", "user_id = $1", [opts.userId]]
        : ["device_id = $1", "device_id = $1", [opts.deviceId]];
    // 1. 今日新增 record 数
    const recCountRows = await query(`SELECT COUNT(*) as count FROM record
     WHERE ${recordWhere} AND created_at::date = $2::date`, [...params, todayStr]);
    const today_records = parseInt(recCountRows[0]?.count ?? "0", 10);
    // 2. Wiki page 中的矛盾/未决（从 content 中 ## 矛盾 段落提取）
    const wikiWhere = opts.userId ? "user_id = $1" : "user_id IN (SELECT user_id FROM record WHERE device_id = $1 LIMIT 1)";
    const contradictionRows = await query(`SELECT title, content FROM wiki_page
     WHERE ${wikiWhere} AND status = 'active'
       AND content ILIKE '%矛盾%'
     LIMIT 10`, params);
    const contradictions = [];
    for (const row of contradictionRows) {
        // 简单提取矛盾段落的第一行
        const match = row.content.match(/##\s*矛盾[^\n]*\n([^\n#]+)/);
        if (match) {
            contradictions.push({
                page_title: row.title,
                snippet: match[1].trim().slice(0, 100),
            });
        }
    }
    // 3. 今日新建/更新的 wiki page
    const wikiChanges = await query(`SELECT title, created_at, updated_at FROM wiki_page
     WHERE ${wikiWhere} AND status = 'active'
       AND (created_at::date = $2::date OR updated_at::date = $2::date)`, [...params, todayStr]);
    const wiki_changes = wikiChanges.map((w) => ({
        title: w.title,
        type: (toLocalDate(w.created_at) === todayStr ? "created" : "updated"),
    }));
    // 4. 行为偏差（待办完成率）
    const todoStats = await query(`SELECT
       COUNT(*)::text as total,
       COUNT(*) FILTER (WHERE done = true)::text as done
     FROM todo
     WHERE ${todoWhere} AND created_at::date = $2::date`, [...params, todayStr]);
    const totalTodos = parseInt(todoStats[0]?.total ?? "0", 10);
    const doneTodos = parseInt(todoStats[0]?.done ?? "0", 10);
    const behavior_drift = {
        today_records,
        todo_completed: doneTodos,
        completion_rate: totalTodos > 0 ? doneTodos / totalTodos : 0,
    };
    const is_empty = today_records === 0 && contradictions.length === 0 && wiki_changes.length === 0;
    return {
        today_records,
        contradictions,
        wiki_changes,
        behavior_drift,
        is_empty,
    };
}
//# sourceMappingURL=report.js.map