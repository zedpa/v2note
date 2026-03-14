import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { goalRepo, pendingIntentRepo } from "../db/repositories/index.js";

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
