import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { memoryRepo } from "../db/repositories/index.js";
export function registerMemoryRoutes(router) {
    // List memories
    router.get("/api/v1/memory", async (req, res, _params, query) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        const dateRange = query.start && query.end
            ? { start: query.start, end: query.end }
            : undefined;
        const memories = userId
            ? await memoryRepo.findByUser(userId, dateRange, limit)
            : await memoryRepo.findByDevice(deviceId, dateRange, limit);
        sendJson(res, memories);
    });
    // Delete memory
    router.delete("/api/v1/memory/:id", async (req, res, params) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        if (userId) {
            await memoryRepo.deleteByIdAndUser(params.id, userId);
        }
        else {
            await memoryRepo.deleteById(params.id, deviceId);
        }
        sendJson(res, { ok: true });
    });
    // Update memory
    router.patch("/api/v1/memory/:id", async (req, res, params) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const body = await readBody(req);
        if (userId) {
            await memoryRepo.updateByUser(params.id, userId, body);
        }
        else {
            await memoryRepo.update(params.id, deviceId, body);
        }
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=memory.js.map