import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { userProfileRepo } from "../db/repositories/index.js";

export function registerProfileRoutes(router: Router) {
  // Get user profile
  router.get("/api/v1/profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const profile = await userProfileRepo.findByUser(userId);
    sendJson(res, profile ?? { device_id: undefined, content: "" });
  });

  // Update user profile
  router.patch("/api/v1/profile", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const { content } = await readBody<{ content: string }>(req);
    await userProfileRepo.upsertByUser(userId, content);
    sendJson(res, { ok: true });
  });
}
