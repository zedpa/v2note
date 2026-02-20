import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { memoryRepo } from "../db/repositories/index.js";

export function registerMemoryRoutes(router: Router) {
  // List memories
  router.get("/api/v1/memory", async (req, res, _params, query) => {
    const deviceId = getDeviceId(req);
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const dateRange =
      query.start && query.end
        ? { start: query.start, end: query.end }
        : undefined;

    const memories = await memoryRepo.findByDevice(deviceId, dateRange, limit);
    sendJson(res, memories);
  });

  // Delete memory
  router.delete("/api/v1/memory/:id", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    await memoryRepo.deleteById(params.id, deviceId);
    sendJson(res, { ok: true });
  });

  // Update memory
  router.patch("/api/v1/memory/:id", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    const body = await readBody<{ content?: string; importance?: number }>(req);
    await memoryRepo.update(params.id, deviceId, body);
    sendJson(res, { ok: true });
  });
}
