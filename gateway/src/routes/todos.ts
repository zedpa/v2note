import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { todoRepo } from "../db/repositories/index.js";

export function registerTodoRoutes(router: Router) {
  // List todos
  router.get("/api/v1/todos", async (req, res) => {
    const deviceId = getDeviceId(req);
    const todos = await todoRepo.findByDevice(deviceId);
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
    const body = await readBody<{ text?: string; done?: boolean }>(req);
    await todoRepo.update(params.id, body);
    sendJson(res, { ok: true });
  });

  // Delete todo
  router.delete("/api/v1/todos/:id", async (_req, res, params) => {
    await todoRepo.del(params.id);
    sendJson(res, { ok: true });
  });
}
