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

  // Create todo
  router.post("/api/v1/todos", async (_req, res) => {
    const { record_id, text } = await readBody<{
      record_id: string;
      text: string;
    }>(_req);
    const todo = await todoRepo.create({ record_id, text });
    sendJson(res, { id: todo.id }, 201);
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
