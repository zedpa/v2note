import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { userProfileRepo } from "../db/repositories/index.js";

export function registerProfileRoutes(router: Router) {
  // Get user profile
  router.get("/api/v1/profile", async (req, res) => {
    const deviceId = getDeviceId(req);
    const profile = await userProfileRepo.findByDevice(deviceId);
    sendJson(res, profile ?? { device_id: deviceId, content: "" });
  });

  // Update user profile
  router.patch("/api/v1/profile", async (req, res) => {
    const deviceId = getDeviceId(req);
    const { content } = await readBody<{ content: string }>(req);
    await userProfileRepo.upsert(deviceId, content);
    sendJson(res, { ok: true });
  });
}
