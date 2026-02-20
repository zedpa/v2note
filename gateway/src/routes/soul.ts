import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { soulRepo } from "../db/repositories/index.js";

export function registerSoulRoutes(router: Router) {
  // Get soul
  router.get("/api/v1/soul", async (req, res) => {
    const deviceId = getDeviceId(req);
    const soul = await soulRepo.findByDevice(deviceId);
    sendJson(res, soul);
  });

  // Update soul
  router.put("/api/v1/soul", async (req, res) => {
    const deviceId = getDeviceId(req);
    const { content } = await readBody<{ content: string }>(req);
    await soulRepo.upsert(deviceId, content);
    sendJson(res, { ok: true });
  });
}
