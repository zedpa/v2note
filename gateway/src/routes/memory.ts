import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { memoryRepo } from "../db/repositories/index.js";

export function registerMemoryRoutes(router: Router) {
  // List memories
  router.get("/api/v1/memory", async (req, res, _params, query) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const dateRange =
      query.start && query.end
        ? { start: query.start, end: query.end }
        : undefined;

    const memories = await memoryRepo.findByUser(userId, dateRange, limit);
    sendJson(res, memories);
  });

  // Delete memory
  router.delete("/api/v1/memory/:id", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    await memoryRepo.deleteByIdAndUser(params.id, userId);
    sendJson(res, { ok: true });
  });

  // Update memory
  router.patch("/api/v1/memory/:id", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const body = await readBody<{ content?: string; importance?: number }>(req);
    await memoryRepo.updateByUser(params.id, userId, body);
    sendJson(res, { ok: true });
  });
}
