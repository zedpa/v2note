/**
 * 统一搜索工具
 *
 * 合并 records/goals/todos/clusters 搜索为一个 search 工具，
 * 支持 filters（status/date/date_from/date_to/goal_id/domain）结构化过滤。
 */
import { recordRepo, summaryRepo } from "../db/repositories/index.js";
import { query as dbQuery } from "../db/pool.js";
export async function unifiedSearch(params, ctx) {
    const { query, scope, limit = 10 } = params;
    // time_range 兼容：映射到 filters.date_from/date_to
    const filters = { ...params.filters };
    if (params.time_range && !filters.date_from && !filters.date_to) {
        filters.date_from = params.time_range.from;
        filters.date_to = params.time_range.to;
    }
    const results = [];
    const scopes = scope === "all"
        ? ["records", "goals", "todos", "clusters"]
        : [scope];
    const promises = [];
    if (scopes.includes("records"))
        promises.push(searchRecords(query, filters, ctx, results));
    if (scopes.includes("goals"))
        promises.push(searchGoals(query, filters, ctx, results));
    if (scopes.includes("todos"))
        promises.push(searchTodos(query, filters, ctx, results));
    if (scopes.includes("clusters"))
        promises.push(searchClusters(query, ctx, results));
    await Promise.all(promises);
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}
// ── 日期解析 ────────────────────────────────────────────────────────────────
function resolveDate(dateStr) {
    const now = new Date();
    if (dateStr === "today")
        return now.toISOString().split("T")[0];
    if (dateStr === "tomorrow") {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
    }
    if (dateStr === "yesterday") {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d.toISOString().split("T")[0];
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr))
        return dateStr.split("T")[0];
    return null;
}
// ── 日记搜索 ────────────────────────────────────────────────────────────────
async function searchRecords(query, filters, ctx, results) {
    try {
        // 解析时间范围
        const dateFrom = filters.date_from ? resolveDate(filters.date_from) : null;
        const dateTo = filters.date_to ? resolveDate(filters.date_to) : null;
        const records = ctx.userId
            ? await recordRepo.searchByUser(ctx.userId, query)
            : await recordRepo.search(ctx.deviceId, query);
        const recordIds = records.map((r) => r.id);
        const summaries = recordIds.length > 0
            ? await summaryRepo.findByRecordIds(recordIds)
            : [];
        const summaryMap = new Map(summaries.map((s) => [s.record_id, s]));
        for (const r of records) {
            // 时间范围过滤
            if (dateFrom || dateTo) {
                const createdDate = r.created_at?.split("T")[0];
                if (dateFrom && createdDate && createdDate < dateFrom)
                    continue;
                if (dateTo && createdDate && createdDate > dateTo)
                    continue;
            }
            const summary = summaryMap.get(r.id);
            results.push({
                id: r.id,
                type: "record",
                title: summary?.title ?? `记录 ${r.id.slice(0, 8)}`,
                snippet: summary?.short_summary?.slice(0, 100),
                score: 1.0,
                created_at: r.created_at,
            });
        }
    }
    catch (err) {
        console.warn("[search] records search failed:", err);
    }
}
// ── 目标搜索 ────────────────────────────────────────────────────────────────
async function searchGoals(query, filters, ctx, results) {
    try {
        const statusFilter = filters.status ?? "active";
        const userId = ctx.userId ?? ctx.deviceId;
        // 根据 status 决定查询范围
        let rows;
        if (statusFilter === "all") {
            rows = await dbQuery(`SELECT id, text AS title, status, created_at FROM todo
         WHERE user_id = $1 AND level >= 1
         ORDER BY created_at DESC`, [userId]);
        }
        else if (statusFilter === "completed") {
            rows = await dbQuery(`SELECT id, text AS title, status, created_at FROM todo
         WHERE user_id = $1 AND level >= 1 AND status = 'completed'
         ORDER BY created_at DESC`, [userId]);
        }
        else {
            // active（默认）
            rows = await dbQuery(`SELECT id, text AS title, status, created_at FROM todo
         WHERE user_id = $1 AND level >= 1 AND status != 'completed' AND done = false
         ORDER BY created_at DESC`, [userId]);
        }
        const queryLower = query.toLowerCase();
        for (const g of rows) {
            if (g.title?.toLowerCase().includes(queryLower)) {
                results.push({
                    id: g.id,
                    type: "goal",
                    title: g.title,
                    score: 0.9,
                    status: g.status,
                    created_at: g.created_at,
                });
            }
        }
    }
    catch (err) {
        console.warn("[search] goals search failed:", err);
    }
}
// ── 待办搜索 ────────────────────────────────────────────────────────────────
async function searchTodos(query, filters, ctx, results) {
    try {
        const statusFilter = filters.status ?? "active";
        const userId = ctx.userId ?? ctx.deviceId;
        // 动态构建 WHERE 子句
        const conditions = ["(t.user_id = $1 OR t.device_id = $1)", "t.level = 0"];
        const params = [userId];
        let paramIdx = 2;
        // status 过滤
        if (statusFilter === "active") {
            conditions.push("t.done = false");
        }
        else if (statusFilter === "completed") {
            conditions.push("t.done = true");
        }
        // "all" 不加 done 过滤
        // goal_id 过滤（parent_id）
        if (filters.goal_id) {
            conditions.push(`t.parent_id = $${paramIdx++}`);
            params.push(filters.goal_id);
        }
        // domain 过滤
        if (filters.domain) {
            conditions.push(`t.domain = $${paramIdx++}`);
            params.push(filters.domain);
        }
        // date 快捷键（今天/明天/昨天）解析为 date_from + date_to 精确匹配
        let dateFrom = null;
        let dateTo = null;
        if (filters.date) {
            const d = resolveDate(filters.date);
            if (d) {
                dateFrom = d;
                dateTo = d;
            }
        }
        else {
            dateFrom = filters.date_from ? resolveDate(filters.date_from) : null;
            dateTo = filters.date_to ? resolveDate(filters.date_to) : null;
        }
        // 有日期过滤时，只查有 scheduled_start 的待办
        if (dateFrom || dateTo) {
            conditions.push("t.scheduled_start IS NOT NULL");
            if (dateFrom) {
                conditions.push(`DATE(t.scheduled_start) >= $${paramIdx++}`);
                params.push(dateFrom);
            }
            if (dateTo) {
                conditions.push(`DATE(t.scheduled_start) <= $${paramIdx++}`);
                params.push(dateTo);
            }
        }
        const sql = `SELECT t.id, t.text, t.done, t.scheduled_start, t.domain, t.parent_id, t.created_at
                 FROM todo t
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY t.created_at DESC
                 LIMIT 100`;
        const todos = await dbQuery(sql, params);
        const queryLower = query.toLowerCase();
        for (const t of todos) {
            if (!t.text?.toLowerCase().includes(queryLower))
                continue;
            results.push({
                id: t.id,
                type: "todo",
                title: t.text,
                score: 0.8,
                status: t.done ? "completed" : "pending",
                created_at: t.created_at,
            });
        }
    }
    catch (err) {
        console.warn("[search] todos search failed:", err);
    }
}
// ── Cluster 搜索 ────────────────────────────────────────────────────────────
async function searchClusters(query, ctx, results) {
    try {
        const userId = ctx.userId ?? ctx.deviceId;
        const clusters = await dbQuery(`SELECT id, nucleus, status, created_at FROM strike
       WHERE user_id = $1 AND is_cluster = true AND status = 'active'
         AND nucleus ILIKE $2
       ORDER BY created_at DESC LIMIT 10`, [userId, `%${query}%`]);
        for (const c of clusters) {
            const nameMatch = c.nucleus.match(/^\[(.+?)\]/);
            const name = nameMatch ? nameMatch[1] : c.nucleus;
            results.push({
                id: c.id,
                type: "cluster",
                title: name,
                snippet: c.nucleus,
                score: 0.85,
                status: c.status,
                created_at: c.created_at,
            });
        }
    }
    catch (err) {
        console.warn("[search] clusters search failed:", err);
    }
}
//# sourceMappingURL=search.js.map