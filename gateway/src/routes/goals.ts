import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { todoRepo, pendingIntentRepo } from "../db/repositories/index.js";
import { queryOne } from "../db/pool.js";
import { computeGoalHealth, createActionEvent, updateGoalStatus, getGoalTimeline } from "../cognitive/goal-linker.js";
import { goalAutoLink, getProjectProgress } from "../cognitive/goal-auto-link.js";

/** 从 device 表查 user_id 作为 fallback */
async function resolveUserId(req: any): Promise<string | null> {
  const uid = getUserId(req);
  if (uid) return uid;
  const deviceId = getDeviceId(req);
  if (!deviceId) return null;
  const row = await queryOne<{ user_id: string | null }>(
    "SELECT user_id FROM device WHERE id = $1",
    [deviceId],
  );
  return row?.user_id ?? null;
}

export function registerGoalRoutes(router: Router) {
  // List active goals（统一模型：todo.level>=1）
  router.get("/api/v1/goals", async (req, res) => {
    const userId = await resolveUserId(req);
    const deviceId = getDeviceId(req);
    const goals = userId
      ? await todoRepo.findActiveGoalsByUser(userId)
      : await todoRepo.findActiveGoalsByDevice(deviceId);
    // 兼容前端：text → title 映射
    const mapped = goals.map((g) => ({
      ...g,
      title: g.text,
    }));
    sendJson(res, mapped);
  });

  // Create goal（统一模型：创建 level=1 的 todo）
  router.post("/api/v1/goals", async (req, res) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const { title, parent_id, source } = await readBody<{
      title: string;
      parent_id?: string;
      source?: string;
    }>(req);
    if (!userId) {
      sendJson(res, { error: "user_id required" }, 400);
      return;
    }
    const goal = await todoRepo.createGoalAsTodo({
      device_id: deviceId,
      user_id: userId,
      text: title,
      level: 1,
      source,
      status: "active",
      parent_id,
    });
    sendJson(res, { ...goal, title: goal.text }, 201);
  });

  // Update goal（统一模型：更新 todo）
  router.patch("/api/v1/goals/:id", async (req, res, params) => {
    const body = await readBody<{ title?: string; status?: string; parent_id?: string | null }>(req);
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.text = body.title;
    if (body.parent_id !== undefined) updates.parent_id = body.parent_id;
    if (body.status !== undefined) {
      // 使用 updateStatus 保持 done 和 status 一致
      await todoRepo.updateStatus(params.id, body.status);
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
    const deviceId = getDeviceId(req);
    const result = await goalAutoLink(params.id, userId ?? deviceId);
    sendJson(res, result);
  });

  // Project progress (项目级子目标进度汇总)
  router.get("/api/v1/goals/:id/progress", async (req, res, params) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);
    const progress = await getProjectProgress(params.id, userId ?? deviceId);
    sendJson(res, progress);
  });

  // Dimension summary（侧边栏 L3 维度统计）
  router.get("/api/v1/dimensions", async (req, res) => {
    const userId = await resolveUserId(req);
    const deviceId = getDeviceId(req);
    const summary = await todoRepo.getDimensionSummary(userId, deviceId);
    sendJson(res, summary);
  });

  // List pending intents
  router.get("/api/v1/intents/pending", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);
    const intents = userId
      ? await pendingIntentRepo.findPendingByUser(userId)
      : await pendingIntentRepo.findPendingByDevice(deviceId);
    sendJson(res, intents);
  });
}
