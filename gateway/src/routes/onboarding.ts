import type { Router } from "../router.js";
import { sendJson, sendError, getUserId, readBody } from "../lib/http-helpers.js";
import { handleOnboardingChat } from "../handlers/onboarding.js";
import { findByUser } from "../db/repositories/user-profile.js";

export function registerOnboardingRoutes(router: Router) {
  /**
   * GET /api/v1/onboarding/status
   * 返回当前用户是否已完成 onboarding。
   */
  router.get("/api/v1/onboarding/status", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    try {
      const profile = await findByUser(userId);
      sendJson(res, { done: profile?.onboarding_done === true });
    } catch (err: any) {
      console.error("[onboarding/status] DB error:", err);
      sendError(res, "Internal error", 500);
    }
  });

  /**
   * POST /api/v1/onboarding/chat
   * 两步引导：step 1 存名字，step 2 处理第一条记录。
   */
  router.post("/api/v1/onboarding/chat", async (req, res) => {
    const userId = getUserId(req);

    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    const body = await readBody<{
      step?: number;
      answer?: string;
    }>(req);

    if (!body.step || body.step < 1 || body.step > 2) {
      sendError(res, "step must be 1-2", 400);
      return;
    }

    try {
      const result = await handleOnboardingChat({
        userId,
        deviceId: userId,
        step: body.step,
        answer: body.answer ?? "",
      });
      sendJson(res, result);
    } catch (err: any) {
      console.error("[onboarding/chat] Error:", err);
      sendError(res, err.message, 500);
    }
  });
}
