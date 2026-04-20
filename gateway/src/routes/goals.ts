import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { todoRepo, pendingIntentRepo } from "../db/repositories/index.js";
import { query as dbQuery } from "../db/pool.js";
import { computeGoalHealth, createActionEvent, updateGoalStatus, getGoalTimeline } from "../cognitive/goal-linker.js";
import { goalAutoLink, getProjectProgress } from "../cognitive/goal-auto-link.js";

export function registerGoalRoutes(router: Router) {
  // List active goals（统一模型：todo.level>=1）
  router.get("/api/v1/goals", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const goals = await todoRepo.findActiveGoalsByUser(userId);
    // 批量查询 wiki page titles
    const wikiPageIds = [...new Set(goals.map((g) => g.wiki_page_id).filter(Boolean))] as string[];
    const wikiTitleMap = new Map<string, string>();
    if (wikiPageIds.length > 0) {
      const rows = await dbQuery<{ id: string; title: string }>(
        `SELECT id, title FROM wiki_page WHERE id = ANY($1) AND status = 'active'`,
        [wikiPageIds],
      );
      for (const r of rows) wikiTitleMap.set(r.id, r.title);
    }

    // 兼容前端：text → title 映射 + wiki page title
    const mapped = goals.map((g) => ({
      ...g,
      title: g.text,
      wiki_page_title: g.wiki_page_id ? wikiTitleMap.get(g.wiki_page_id) ?? null : null,
    }));
    sendJson(res, mapped);
  });

  // Create goal（统一模型：创建 level=1 的 todo）
  router.post("/api/v1/goals", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }
    const { title, parent_id, source } = await readBody<{
      title: string;
      parent_id?: string;
      source?: string;
    }>(req);
    // parent_id → level=0 行动；无父级 → level=1 目标
    const level: 0 | 1 = parent_id ? 0 : 1;
    const goal = await todoRepo.createGoalAsTodo({
      device_id: userId,
      user_id: userId,
      text: title,
      level,
      source,
      status: "active",
      parent_id,
    });
    sendJson(res, { ...goal, title: goal.text }, 201);
  });

  // Update goal（统一模型：更新 todo）
  router.patch("/api/v1/goals/:id", async (req, res, params) => {
    const body = await readBody<{ title?: string; status?: string; parent_id?: string | null; done?: boolean }>(req);
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.text = body.title;
    if (body.parent_id !== undefined) updates.parent_id = body.parent_id;
    if (body.status !== undefined) {
      await todoRepo.updateStatus(params.id, body.status);
    }
    if (body.done !== undefined) {
      updates.done = body.done;
      if (body.status === undefined) {
        updates.status = body.done ? "completed" : "active";
      }
    }
    if (Object.keys(updates).length > 0) {
      await todoRepo.update(params.id, updates);
    }
    sendJson(res, { ok: true });
  });

  // Get goal with associated todos（统一模型：查子 todo）
  router.get("/api/v1/goals/:id/todos", async (_req, res, params) => {
    const todos = await todoRepo.findChildTodos(params.id);
    sendJson(res, todos);
  });

  // Goal health (四维健康度)
  router.get("/api/v1/goals/:id/health", async (_req, res, params) => {
    const health = await computeGoalHealth(params.id);
    if (!health) {
      sendJson(res, { error: "目标无关联 Cluster，无法计算健康度" }, 404);
      return;
    }
    sendJson(res, health);
  });

  // Goal timeline (通过 Cluster 追溯相关日记)
  router.get("/api/v1/goals/:id/timeline", async (_req, res, params) => {
    const timeline = await getGoalTimeline(params.id);
    sendJson(res, timeline);
  });

  // Action event (行动事件：完成/跳过)
  router.post("/api/v1/action-panel/event", async (req, res) => {
    const body = await readBody<{
      todo_id: string;
      type: "complete" | "skip" | "resume";
      reason?: string;
    }>(req);
    await createActionEvent(body);
    sendJson(res, { ok: true }, 201);
  });

  // Confirm/dismiss suggested goal（统一模型）
  router.post("/api/v1/goals/:id/confirm", async (_req, res, params) => {
    await todoRepo.updateStatus(params.id, "active");
    sendJson(res, { ok: true });
  });

  router.post("/api/v1/goals/:id/archive", async (_req, res, params) => {
    await todoRepo.updateStatus(params.id, "archived");
    sendJson(res, { ok: true });
  });

  // Goal auto-link (创建后全量关联)
  router.post("/api/v1/goals/:id/auto-link", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) { sendJson(res, { error: "user_id required" }, 401); return; }
    const result = await goalAutoLink(params.id, userId);
    sendJson(res, result);
  });

  // Project progress (项目级子目标进度汇总)
  router.get("/api/v1/goals/:id/progress", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) { sendJson(res, { error: "user_id required" }, 401); return; }
    const progress = await getProjectProgress(params.id, userId);
    sendJson(res, progress);
  });

  // Dimension summary（侧边栏 L3 维度统计）
  // @deprecated 保留兼容，新代码使用 /api/v1/sidebar/my-world
  router.get("/api/v1/dimensions", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const summary = await todoRepo.getDimensionSummary(userId, undefined);
    sendJson(res, summary);
  });

  // @deprecated debug-emergence / emergence / backfill 路由已移除（Phase 12）

  // 侧边栏"我的世界"树结构
  router.get("/api/v1/sidebar/my-world", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { nodes: [] });
      return;
    }
    const nodes = await todoRepo.getMyWorldData(userId);
    sendJson(res, { nodes });
  });

  // List pending intents
  router.get("/api/v1/intents/pending", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const intents = await pendingIntentRepo.findPendingByUser(userId);
    sendJson(res, intents);
  });
}
