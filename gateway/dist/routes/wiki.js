/**
 * Wiki API 路由 — 编译触发 + Page 查询
 */
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { compileWikiForUser } from "../cognitive/wiki-compiler.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";
import * as goalRepo from "../db/repositories/goal.js";
import { wikiUnifiedSearch } from "../tools/wiki-search.js";
import { query } from "../db/pool.js";
export function registerWikiRoutes(router) {
    // POST /api/v1/wiki/compile — 手动触发编译
    router.post("/api/v1/wiki/compile", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendJson(res, { error: "Unauthorized" }, 401);
            return;
        }
        try {
            const result = await compileWikiForUser(userId);
            sendJson(res, result);
        }
        catch (err) {
            console.error(`[wiki] compile error:`, err.message);
            sendJson(res, { error: "Compile failed", message: err.message }, 500);
        }
    });
    // GET /api/v1/wiki/pages — 获取用户 wiki page 列表
    router.get("/api/v1/wiki/pages", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendJson(res, { error: "Unauthorized" }, 401);
            return;
        }
        try {
            const pages = await wikiPageRepo.findByUser(userId, { status: "active" });
            const result = pages.map((p) => ({
                id: p.id,
                title: p.title,
                summary: p.summary,
                level: p.level,
                parent_id: p.parent_id,
                domain: p.domain,
                updated_at: p.updated_at,
            }));
            sendJson(res, result);
        }
        catch (err) {
            console.error(`[wiki] list pages error:`, err.message);
            sendJson(res, { error: "Failed to list pages" }, 500);
        }
    });
    // GET /api/v1/wiki/pages/:id — 获取单个 wiki page 详情
    router.get("/api/v1/wiki/pages/:id", async (req, res, params) => {
        const userId = getUserId(req);
        if (!userId) {
            sendJson(res, { error: "Unauthorized" }, 401);
            return;
        }
        try {
            const page = await wikiPageRepo.findById(params.id);
            if (!page || page.user_id !== userId) {
                sendJson(res, { error: "Page not found" }, 404);
                return;
            }
            // 加载子 page
            const children = await wikiPageRepo.findByParent(page.id);
            // 加载关联的 goal
            const goals = await goalRepo.findByUser(userId);
            const pageGoals = goals.filter((g) => g.wiki_page_id === page.id);
            // 加载关联的 record ID
            const recordLinks = await wikiPageRecordRepo.findRecordsByPage(page.id);
            sendJson(res, {
                id: page.id,
                title: page.title,
                content: page.content,
                summary: page.summary,
                level: page.level,
                children: children.map((c) => ({
                    id: c.id,
                    title: c.title,
                    summary: c.summary,
                    level: c.level,
                })),
                goals: pageGoals.map((g) => ({
                    id: g.id,
                    title: g.title,
                    status: g.status,
                })),
                source_records: recordLinks.map((r) => ({
                    record_id: r.record_id,
                    added_at: r.added_at,
                })),
            });
        }
        catch (err) {
            console.error(`[wiki] get page error:`, err.message);
            sendJson(res, { error: "Failed to get page" }, 500);
        }
    });
    // GET /api/v1/wiki/sidebar — 侧边栏专用：wiki page 树 + 收件箱数
    router.get("/api/v1/wiki/sidebar", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendJson(res, { error: "Unauthorized" }, 401);
            return;
        }
        try {
            // 并行查询：wiki pages + record counts + active goals + inbox count
            const [pages, recordCounts, activeGoals, inboxRows] = await Promise.all([
                wikiPageRepo.findByUser(userId, { status: "active" }),
                query(`SELECT wiki_page_id, COUNT(*)::text AS cnt FROM wiki_page_record wpr
           JOIN wiki_page wp ON wp.id = wpr.wiki_page_id
           WHERE wp.user_id = $1 AND wp.status = 'active'
           GROUP BY wiki_page_id`, [userId]),
                query(`SELECT wiki_page_id, id, text AS title FROM todo
           WHERE user_id = $1 AND level >= 1
             AND wiki_page_id IS NOT NULL
             AND status IN ('active', 'progressing')`, [userId]),
                query(`SELECT COUNT(*)::text AS count FROM record r
           WHERE r.user_id = $1 AND r.status = 'completed' AND r.archived = false
             AND NOT EXISTS (
               SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id
             )`, [userId]),
            ]);
            const countMap = new Map(recordCounts.map((r) => [r.wiki_page_id, parseInt(r.cnt, 10)]));
            const goalMap = new Map();
            for (const g of activeGoals) {
                const list = goalMap.get(g.wiki_page_id) ?? [];
                list.push({ id: g.id, title: g.title });
                goalMap.set(g.wiki_page_id, list);
            }
            const tree = pages.map((p) => ({
                id: p.id,
                title: p.title,
                level: p.level,
                parentId: p.parent_id,
                createdBy: p.created_by,
                recordCount: countMap.get(p.id) ?? 0,
                activeGoals: (goalMap.get(p.id) ?? []).slice(0, 3),
                updatedAt: p.updated_at,
            }));
            // 按 level DESC (L3 first), 再按 updatedAt DESC
            tree.sort((a, b) => {
                if (a.level !== b.level)
                    return b.level - a.level;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
            sendJson(res, {
                pages: tree,
                inboxCount: parseInt(inboxRows[0]?.count ?? "0", 10),
            });
        }
        catch (err) {
            console.error(`[wiki] sidebar error:`, err.message);
            sendJson(res, { error: "Failed to load sidebar" }, 500);
        }
    });
    // POST /api/v1/wiki/pages — 用户手动创建 wiki page
    router.post("/api/v1/wiki/pages", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        try {
            const body = await readBody(req);
            if (!body.title || body.title.trim().length === 0) {
                sendError(res, "Title is required", 400);
                return;
            }
            const page = await wikiPageRepo.create({
                user_id: userId,
                title: body.title.trim(),
                parent_id: body.parentId,
                level: body.parentId ? 2 : 3,
                created_by: "user",
            });
            sendJson(res, { id: page.id, title: page.title, level: page.level });
        }
        catch (err) {
            console.error(`[wiki] create page error:`, err.message);
            sendError(res, err.message ?? "Failed to create page", 500);
        }
    });
    // PATCH /api/v1/wiki/pages/:id — 用户重命名/移动 wiki page
    router.patch("/api/v1/wiki/pages/:id", async (req, res, params) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        try {
            const page = await wikiPageRepo.findById(params.id);
            if (!page || page.user_id !== userId) {
                sendError(res, "Page not found", 404);
                return;
            }
            const body = await readBody(req);
            const updates = {};
            if (body.title !== undefined) {
                const trimmed = body.title.trim();
                if (trimmed.length === 0) {
                    sendError(res, "Title cannot be empty", 400);
                    return;
                }
                updates.title = trimmed;
            }
            if (body.parentId !== undefined) {
                // 校验：不能自引用
                if (body.parentId === params.id) {
                    sendError(res, "Cannot set page as its own parent", 400);
                    return;
                }
                // 校验：parent 存在且属于同一用户
                if (body.parentId) {
                    const parent = await wikiPageRepo.findById(body.parentId);
                    if (!parent || parent.user_id !== userId) {
                        sendError(res, "Parent page not found", 404);
                        return;
                    }
                    // 校验：parent 不是当前 page 的后代（防循环）
                    if (parent.parent_id === params.id) {
                        sendError(res, "Circular reference detected", 400);
                        return;
                    }
                }
                await query(`UPDATE wiki_page SET parent_id = $1, level = $2, updated_at = now() WHERE id = $3`, [body.parentId, body.parentId ? 2 : 3, params.id]);
            }
            if (updates.title) {
                await wikiPageRepo.update(params.id, updates);
            }
            // 用户触碰后，标记 created_by = 'user'
            await query(`UPDATE wiki_page SET created_by = 'user' WHERE id = $1`, [params.id]);
            sendJson(res, { ok: true });
        }
        catch (err) {
            console.error(`[wiki] update page error:`, err.message);
            sendError(res, err.message ?? "Failed to update page", 500);
        }
    });
    // GET /api/v1/search — 统一搜索（wiki + record 双层）
    router.get("/api/v1/search", async (req, res, _params, query) => {
        const userId = getUserId(req);
        if (!userId) {
            sendJson(res, { error: "Unauthorized" }, 401);
            return;
        }
        const q = query.q;
        if (!q) {
            sendJson(res, { error: "Missing query parameter: q" }, 400);
            return;
        }
        try {
            const result = await wikiUnifiedSearch(q, userId);
            sendJson(res, result);
        }
        catch (err) {
            console.error(`[wiki] search error:`, err.message);
            sendJson(res, { error: "Search failed", message: err.message }, 500);
        }
    });
}
//# sourceMappingURL=wiki.js.map