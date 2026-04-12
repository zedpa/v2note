/**
 * Wiki API 路由 — 编译触发 + Page 查询
 */

import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { compileWikiForUser } from "../cognitive/wiki-compiler.js";
import { runFullCompileMaintenance } from "../cognitive/full-compile-maintenance.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";
import * as wikiPageLinkRepo from "../db/repositories/wiki-page-link.js";
import * as goalRepo from "../db/repositories/goal.js";
import { wikiUnifiedSearch } from "../tools/wiki-search.js";
import { getPendingSuggestions, acceptSuggestion, rejectSuggestion } from "../cognitive/page-authorization.js";
import { query, getPool } from "../db/pool.js";

export function registerWikiRoutes(router: Router) {
  // POST /api/v1/wiki/compile — 手动触发编译
  // body.mode === "full" 时执行全量维护（5 阶段），否则只执行简单编译
  router.post("/api/v1/wiki/compile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    try {
      const body = await readBody<{ mode?: string }>(req).catch(() => ({} as { mode?: string }));
      if (body.mode === "full") {
        const result = await runFullCompileMaintenance(userId);
        sendJson(res, result);
      } else {
        const result = await compileWikiForUser(userId);
        sendJson(res, result);
      }
    } catch (err: any) {
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
    } catch (err: any) {
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

      // Phase 14.6: goal page 返回进度信息
      let todoStats: { todo_total: number; todo_done: number } | undefined;
      if (page.page_type === "goal") {
        const stats = await query<{ total: string; done: string }>(
          `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE done = true)::text AS done
           FROM todo
           WHERE wiki_page_id = $1 OR parent_id IN (
             SELECT id FROM todo WHERE wiki_page_id = $1 AND level >= 1
           )`,
          [page.id],
        );
        const row = stats[0];
        todoStats = {
          todo_total: parseInt(row?.total ?? "0", 10),
          todo_done: parseInt(row?.done ?? "0", 10),
        };
      }

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
        ...(todoStats ?? {}),
      });
    } catch (err: any) {
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
      const [pages, recordCounts, activeGoals, inboxRows, pendingSuggestionRows] = await Promise.all([
        wikiPageRepo.findByUser(userId, { status: "active" }),
        query<{ wiki_page_id: string; cnt: string }>(
          `SELECT wiki_page_id, COUNT(*)::text AS cnt FROM wiki_page_record wpr
           JOIN wiki_page wp ON wp.id = wpr.wiki_page_id
           WHERE wp.user_id = $1 AND wp.status = 'active'
           GROUP BY wiki_page_id`,
          [userId],
        ),
        query<{ wiki_page_id: string; id: string; title: string }>(
          `SELECT wiki_page_id, id, text AS title FROM todo
           WHERE user_id = $1 AND level >= 1
             AND wiki_page_id IS NOT NULL
             AND status IN ('active', 'progressing')`,
          [userId],
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM record r
           WHERE r.user_id = $1 AND r.status = 'completed' AND r.archived = false
             AND NOT EXISTS (
               SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id
             )`,
          [userId],
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM wiki_compile_suggestion
           WHERE user_id = $1 AND status = 'pending'`,
          [userId],
        ),
      ]);

      const countMap = new Map(recordCounts.map((r) => [r.wiki_page_id, parseInt(r.cnt, 10)]));
      const goalMap = new Map<string, { id: string; title: string }[]>();
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
        pageType: p.page_type,
        recordCount: countMap.get(p.id) ?? 0,
        activeGoals: (goalMap.get(p.id) ?? []).slice(0, 3),
        updatedAt: p.updated_at,
      }));

      // 按 level DESC (L3 first), 再按 updatedAt DESC
      tree.sort((a, b) => {
        if (a.level !== b.level) return b.level - a.level;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      sendJson(res, {
        pages: tree,
        inboxCount: parseInt(inboxRows[0]?.count ?? "0", 10),
        pendingSuggestionCount: parseInt(pendingSuggestionRows[0]?.count ?? "0", 10),
      });
    } catch (err: any) {
      console.error(`[wiki] sidebar error:`, err.message);
      sendJson(res, { error: "Failed to load sidebar" }, 500);
    }
  });

  // POST /api/v1/wiki/pages — 用户手动创建 wiki page
  // page_type='goal' 时同时创建 goal todo
  router.post("/api/v1/wiki/pages", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    try {
      const body = await readBody<{ title: string; parentId?: string; page_type?: "topic" | "goal" }>(req);
      if (!body.title || body.title.trim().length === 0) {
        sendError(res, "Title is required", 400);
        return;
      }

      const trimmedTitle = body.title.trim();

      if (body.page_type === "goal") {
        // Phase 14.6: goal page + goal todo 在同一事务中创建
        const client = await getPool().connect();
        try {
          await client.query("BEGIN");
          const { rows } = await client.query(
            `INSERT INTO wiki_page (user_id, title, parent_id, level, page_type, created_by)
             VALUES ($1, $2, $3, $4, 'goal', 'user')
             RETURNING id, title, level`,
            [userId, trimmedTitle, body.parentId ?? null, body.parentId ? 2 : 3],
          );
          const page = rows[0];
          await client.query(
            `INSERT INTO todo (device_id, user_id, text, status, level, done, category, wiki_page_id)
             VALUES ($1, $2, $3, 'active', 1, false, 'manual', $4)`,
            [userId, userId, trimmedTitle, page.id],
          );
          await client.query("COMMIT");
          sendJson(res, { id: page.id, title: page.title, level: page.level, page_type: "goal", created_by: "user" });
        } catch (txErr) {
          await client.query("ROLLBACK");
          throw txErr;
        } finally {
          client.release();
        }
      } else {
        const page = await wikiPageRepo.create({
          user_id: userId,
          title: trimmedTitle,
          parent_id: body.parentId,
          level: body.parentId ? 2 : 3,
          page_type: body.page_type,
          created_by: "user",
        });
        sendJson(res, { id: page.id, title: page.title, level: page.level, page_type: page.page_type, created_by: "user" });
      }
    } catch (err: any) {
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

      const body = await readBody<{ title?: string; parentId?: string | null }>(req);
      const updates: Parameters<typeof wikiPageRepo.update>[1] = {};

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
        await query(
          `UPDATE wiki_page SET parent_id = $1, level = $2, updated_at = now() WHERE id = $3`,
          [body.parentId, body.parentId ? 2 : 3, params.id],
        );
      }

      if (updates.title) {
        await wikiPageRepo.update(params.id, updates);
      }

      // 用户触碰后，标记 created_by = 'user'
      await query(
        `UPDATE wiki_page SET created_by = 'user' WHERE id = $1`,
        [params.id],
      );

      sendJson(res, { ok: true });
    } catch (err: any) {
      console.error(`[wiki] update page error:`, err.message);
      sendError(res, err.message ?? "Failed to update page", 500);
    }
  });

  // ── Phase 14.7: 建议 API ──

  // GET /api/v1/wiki/suggestions — 查询待处理建议
  router.get("/api/v1/wiki/suggestions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    try {
      const suggestions = await getPendingSuggestions(userId);
      sendJson(res, { suggestions });
    } catch (err: any) {
      console.error(`[wiki] list suggestions error:`, err.message);
      sendJson(res, { error: "Failed to list suggestions" }, 500);
    }
  });

  // POST /api/v1/wiki/suggestions/:id/accept — 接受建议
  router.post("/api/v1/wiki/suggestions/:id/accept", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    try {
      await acceptSuggestion(params.id, userId);
      sendJson(res, { ok: true });
    } catch (err: any) {
      console.error(`[wiki] accept suggestion error:`, err.message);
      sendJson(res, { error: "Failed to accept suggestion" }, 500);
    }
  });

  // POST /api/v1/wiki/suggestions/:id/reject — 拒绝建议
  router.post("/api/v1/wiki/suggestions/:id/reject", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    try {
      await rejectSuggestion(params.id, userId);
      sendJson(res, { ok: true });
    } catch (err: any) {
      console.error(`[wiki] reject suggestion error:`, err.message);
      sendJson(res, { error: "Failed to reject suggestion" }, 500);
    }
  });

  // GET /api/v1/wiki/pages/:id/links — 获取 page 关联链接（Phase 14.11）
  router.get("/api/v1/wiki/pages/:id/links", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    try {
      // 校验 page 存在且属于当前用户
      const page = await wikiPageRepo.findById(params.id);
      if (!page || page.user_id !== userId) {
        sendJson(res, { error: "Page not found" }, 404);
        return;
      }

      const links = await wikiPageLinkRepo.findByPage(params.id);
      sendJson(res, links);
    } catch (err: any) {
      console.error(`[wiki] get page links error:`, err.message);
      sendJson(res, { error: "Failed to get page links" }, 500);
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
    } catch (err: any) {
      console.error(`[wiki] search error:`, err.message);
      sendJson(res, { error: "Search failed", message: err.message }, 500);
    }
  });
}
