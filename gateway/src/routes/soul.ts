import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { soulRepo } from "../db/repositories/index.js";

export function registerSoulRoutes(router: Router) {
  // Get soul
  router.get("/api/v1/soul", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const soul = await soulRepo.findByUser(userId);
    sendJson(res, soul);
  });

  // Update soul
  router.put("/api/v1/soul", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const { content } = await readBody<{ content: string }>(req);
    await soulRepo.upsertByUser(userId, content);
    sendJson(res, { ok: true });
  });
}
