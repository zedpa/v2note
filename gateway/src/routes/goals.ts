import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { goalRepo, pendingIntentRepo } from "../db/repositories/index.js";
import { computeGoalHealth, createActionEvent, updateGoalStatus, getGoalTimeline } from "../cognitive/goal-linker.js";
import { goalAutoLink, getProjectProgress } from "../cognitive/goal-auto-link.js";

export function registerGoalRoutes(router: Router) {
  // List active goals
  router.get("/api/v1/goals", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);
    const goals = userId
      ? await goalRepo.findActiveByUser(userId)
      : await goalRepo.findActiveByDevice(deviceId);
    sendJson(res, goals);
  });

  // Create goal
  router.post("/api/v1/goals", async (req, res) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const { title, parent_id, source } = await readBody<{
      title: string;
      parent_id?: string;
      source?: string;
    }>(req);
    const goal = await goalRepo.create({ device_id: deviceId, user_id: userId ?? undefined, title, parent_id, source });
    sendJson(res, goal, 201);
  });

  // Update goal
  router.patch("/api/v1/goals/:id", async (req, res, params) => {
    const body = await readBody<{ title?: string; status?: string; parent_id?: string | null }>(req);
    await goalRepo.update(params.id, body);
    sendJson(res, { ok: true });
  });

  // Get goal with associated todos
  router.get("/api/v1/goals/:id/todos", async (_req, res, params) => {
    const todos = await goalRepo.findWithTodos(params.id);
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

    // 如果跳过次数达 3 次，触发 goal 状态检查
    if (body.type === "skip") {
      // 异步更新 goal 状态
      import("../db/repositories/todo.js").then(async (todoRepo) => {
        const todos = await todoRepo.findByRecordId(body.todo_id).catch(() => []);
        // 获取 todo 的 goal_id 并触发状态检查
      }).catch(() => {});
    }

    sendJson(res, { ok: true }, 201);
  });

  // Confirm/dismiss suggested goal
  router.post("/api/v1/goals/:id/confirm", async (_req, res, params) => {
    await updateGoalStatus(params.id, "user_confirm");
    sendJson(res, { ok: true });
  });

  router.post("/api/v1/goals/:id/archive", async (_req, res, params) => {
    await updateGoalStatus(params.id, "user_archive");
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
