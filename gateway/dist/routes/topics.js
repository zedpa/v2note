import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { query } from "../db/pool.js";
import { wikiPageRepo, goalRepo } from "../db/repositories/index.js";
import { parseWikiSeeds, parseWikiHarvest } from "./topics-wiki-helpers.js";
export function registerTopicRoutes(router) {
    // ── GET /api/v1/topics ──
    // 返回基于 wiki_page 的主题列表
    router.get("/api/v1/topics", async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                sendError(res, "Missing user identity", 401);
                return;
            }
            // 1. 查询 active wiki pages
            const wikiPages = await wikiPageRepo.findByUser(userId, { status: "active" });
            if (wikiPages.length === 0) {
                sendJson(res, []);
                return;
            }
            const pageIds = wikiPages.map((p) => p.id);
            // 2. 批量查询每个 page 的 record 关联数
            const recordCounts = await query(`SELECT wiki_page_id, COUNT(*) as cnt FROM wiki_page_record
         WHERE wiki_page_id = ANY($1)
         GROUP BY wiki_page_id`, [pageIds]);
            const recordCountMap = new Map(recordCounts.map((r) => [r.wiki_page_id, parseInt(r.cnt, 10)]));
            // 3. 批量查询 active goals（通过 wiki_page_id）
            const activeGoals = await query(`SELECT id, device_id, user_id, text AS title, parent_id, status,
                COALESCE(category, 'speech') AS source, cluster_id, wiki_page_id,
                created_at, COALESCE(updated_at, created_at) AS updated_at
         FROM todo
         WHERE level >= 1
           AND wiki_page_id = ANY($1)
           AND status IN ('active', 'progressing')`, [pageIds]);
            const goalsByPage = new Map();
            for (const g of activeGoals) {
                if (!g.wiki_page_id)
                    continue;
                const list = goalsByPage.get(g.wiki_page_id) ?? [];
                list.push({ id: g.id, title: g.title });
                goalsByPage.set(g.wiki_page_id, list);
            }
            // 4. 组装结果
            const topics = wikiPages.map((page) => {
                const goals = goalsByPage.get(page.id) ?? [];
                return {
                    wikiPageId: page.id,
                    title: page.title,
                    recordCount: recordCountMap.get(page.id) ?? 0,
                    activeGoals: goals.slice(0, 3),
                    lastActivity: page.updated_at,
                    hasActiveGoal: goals.length > 0,
                    level: page.level,
                    parentId: page.parent_id,
                };
            });
            // 按 lastActivity 降序排序
            topics.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
            sendJson(res, topics);
        }
        catch (err) {
            console.error("[topics] GET /api/v1/topics error:", err);
            sendError(res, err.message ?? "Internal error", 500);
        }
    });
    // ── GET /api/v1/topics/:id/lifecycle ──
    // 返回特定 wiki page 的四阶段生命周期数据
    router.get("/api/v1/topics/:id/lifecycle", async (_req, res, params) => {
        try {
            const pageId = params.id;
            // 验证 wiki page 存在
            const page = await wikiPageRepo.findById(pageId);
            if (!page || page.status !== "active") {
                sendError(res, "Wiki page not found", 404);
                return;
            }
            // 获取关联的所有 goals（通过 wiki_page_id）
            const allGoals = await query(`SELECT id, device_id, user_id, text AS title, parent_id, status,
                COALESCE(category, 'speech') AS source, cluster_id, wiki_page_id,
                created_at, COALESCE(updated_at, created_at) AS updated_at
         FROM todo
         WHERE level >= 1
           AND wiki_page_id = $1`, [pageId]);
            const activeGoals = allGoals.filter((g) => g.status === "active" || g.status === "progressing");
            const completedGoals = allGoals.filter((g) => g.status === "completed");
            // ── now: 今天与 wiki page goals 相关的 todos ──
            const activeGoalIds = activeGoals.map((g) => g.id);
            let nowTodos = [];
            if (activeGoalIds.length > 0) {
                nowTodos = await query(`SELECT t.* FROM todo t
           WHERE t.parent_id = ANY($1)
             AND t.level = 0
             AND t.done = false
             AND (t.scheduled_start IS NULL OR t.scheduled_start::date <= CURRENT_DATE)
           ORDER BY t.priority DESC, t.created_at ASC`, [activeGoalIds]);
            }
            // ── growing: active goals 及其 todos 和完成进度 ──
            const growing = [];
            if (activeGoalIds.length > 0) {
                // 批量查询所有 active goals 的子 todos
                const allTodos = await query(`SELECT parent_id, id, text, done FROM todo
           WHERE parent_id = ANY($1) AND level = 0
           ORDER BY created_at`, [activeGoalIds]);
                const todosByGoal = new Map();
                for (const todo of allTodos) {
                    const list = todosByGoal.get(todo.parent_id) ?? [];
                    list.push(todo);
                    todosByGoal.set(todo.parent_id, list);
                }
                for (const goal of activeGoals) {
                    const todos = todosByGoal.get(goal.id) ?? [];
                    const total = todos.length;
                    const done = todos.filter((t) => t.done).length;
                    growing.push({
                        goal,
                        todos,
                        completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
                    });
                }
            }
            // ── seeds: 从 wiki page content 解析段落 ──
            const seeds = parseWikiSeeds(page.content);
            // ── harvest: completed goals + wiki page 收获段落 ──
            const harvestParagraphs = parseWikiHarvest(page.content);
            const harvest = completedGoals.map((goal) => {
                // 尝试匹配收获段落中与 goal 相关的内容
                const matchedParagraph = harvestParagraphs.find((p) => p.content.includes(goal.title));
                return {
                    goal: { id: goal.id, title: goal.title, status: goal.status },
                    content: matchedParagraph?.content ?? "",
                    completedAt: goal.updated_at,
                };
            });
            const result = { now: nowTodos, growing, seeds, harvest };
            sendJson(res, result);
        }
        catch (err) {
            console.error("[topics] GET lifecycle error:", err);
            sendError(res, err.message ?? "Internal error", 500);
        }
    });
    // ── POST /api/v1/goals/:id/harvest ──
    // 收获：标记目标完成（wiki 模式下不再创建 review Strike，由编译写入 wiki）
    router.post("/api/v1/goals/:id/harvest", async (_req, res, params) => {
        try {
            const goalId = params.id;
            // 1. 获取目标
            const goal = await goalRepo.findById(goalId);
            if (!goal) {
                sendError(res, "Goal not found", 404);
                return;
            }
            // 2. 标记目标为完成（下次编译时 AI 会在 wiki page 中写入收获段落）
            await goalRepo.update(goalId, { status: "completed" });
            sendJson(res, {
                goalId: goal.id,
                title: goal.title,
                wikiPageId: goal.wiki_page_id ?? null,
            });
        }
        catch (err) {
            console.error("[topics] POST harvest error:", err);
            sendError(res, err.message ?? "Internal error", 500);
        }
    });
}
//# sourceMappingURL=topics.js.map