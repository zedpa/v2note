import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { soulRepo } from "../db/repositories/index.js";
export function registerSoulRoutes(router) {
    // Get soul
    router.get("/api/v1/soul", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const soul = userId
            ? await soulRepo.findByUser(userId)
            : await soulRepo.findByDevice(deviceId);
        sendJson(res, soul);
    });
    // Update soul
    router.put("/api/v1/soul", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const { content } = await readBody(req);
        if (userId) {
            await soulRepo.upsertByUser(userId, content);
        }
        else {
            await soulRepo.upsert(deviceId, content);
        }
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=soul.js.map