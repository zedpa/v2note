import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { todoRepo } from "../db/repositories/index.js";
import { onTodoComplete } from "../cognitive/todo-projector.js";

export function registerTodoRoutes(router: Router) {
  // List todos
  router.get("/api/v1/todos", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);
    const todos = userId
      ? await todoRepo.findByUser(userId)
      : await todoRepo.findByDevice(deviceId);
    sendJson(res, todos);
  });

  // Create todo（支持无 record_id 的手动创建）
  router.post("/api/v1/todos", async (_req, res) => {
    const body = await readBody<{
      record_id?: string;
      text: string;
      domain?: string;
      impact?: number;
      goal_id?: string;
      scheduled_start?: string;
      estimated_minutes?: number;
      parent_id?: string;
      level?: number;
      status?: string;
    }>(_req);
    const userId = getUserId(_req) ?? undefined;
    const deviceId = getDeviceId(_req);
    const todo = await todoRepo.create({
      record_id: body.record_id || null,
      text: body.text,
      domain: body.domain,
      impact: body.impact,
      goal_id: body.goal_id,
      scheduled_start: body.scheduled_start,
      estimated_minutes: body.estimated_minutes,
      parent_id: body.parent_id,
      level: body.level,
      status: body.status,
      user_id: userId,
      device_id: deviceId,
    });
    sendJson(res, { id: todo.id }, 201);
  });

  // Get subtasks of a todo
  router.get("/api/v1/todos/:id/subtasks", async (_req, res, params) => {
    const subtasks = await todoRepo.findSubtasks(params.id);
    sendJson(res, subtasks);
  });

  // Update todo
  router.patch("/api/v1/todos/:id", async (req, res, params) => {
    const body = await readBody<{
      text?: string;
      done?: boolean;
      scheduled_start?: string | null;
      scheduled_end?: string | null;
      estimated_minutes?: number | null;
      priority?: number;
      level?: number;
      status?: string;
      domain?: string;
    }>(req);
    await todoRepo.update(params.id, body);
    // todo 完成时触发双向一致性：降低 Strike salience
    if (body.done === true) {
      onTodoComplete(params.id).catch((e) =>
        console.error("[todos] onTodoComplete failed:", e),
      );
    }
    sendJson(res, { ok: true });
  });

  // Delete todo
  router.delete("/api/v1/todos/:id", async (_req, res, params) => {
    await todoRepo.del(params.id);
    sendJson(res, { ok: true });
  });
}
