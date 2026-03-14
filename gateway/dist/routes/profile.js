import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { userProfileRepo } from "../db/repositories/index.js";
export function registerProfileRoutes(router) {
    // Get user profile
    router.get("/api/v1/profile", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const profile = userId
            ? await userProfileRepo.findByUser(userId)
            : await userProfileRepo.findByDevice(deviceId);
        sendJson(res, profile ?? { device_id: deviceId, content: "" });
    });
    // Update user profile
    router.patch("/api/v1/profile", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const { content } = await readBody(req);
        if (userId) {
            await userProfileRepo.upsertByUser(userId, content);
        }
        else {
            await userProfileRepo.upsert(deviceId, content);
        }
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=profile.js.map