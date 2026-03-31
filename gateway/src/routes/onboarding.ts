import type { Router } from "../router.js";
import { sendJson, sendError, getUserId, getDeviceId } from "../lib/http-helpers.js";
import { readBody } from "../lib/http-helpers.js";
import { handleOnboardingAnswer, handleOnboardingChat } from "../handlers/onboarding.js";
import { seedWelcomeDiaries } from "../handlers/welcome-seed.js";

export function registerOnboardingRoutes(router: Router) {
  /**
   * POST /api/v1/onboarding/chat
   * AI 驱动的冷启动对话（v2）。
   */
  router.post("/api/v1/onboarding/chat", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);

    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    const body = await readBody<{
      step?: number;
      answer?: string;
      history?: Array<{ role: "ai" | "user"; text: string }>;
    }>(req);

    if (!body.step || body.step < 1 || body.step > 5) {
      sendError(res, "step must be 1-5", 400);
      return;
    }

    try {
      const result = await handleOnboardingChat({
        userId,
        deviceId,
        step: body.step,
        answer: body.answer ?? "",
        history: body.history ?? [],
      });
      sendJson(res, result);
    } catch (err: any) {
      console.error("[onboarding/chat] Error:", err);
      sendError(res, err.message, 500);
    }
  });

  /**
   * POST /api/v1/onboarding/answer
   * @deprecated 旧版接口，保持兼容
   */
  router.post("/api/v1/onboarding/answer", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);

    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    const body = await readBody<{
      step?: number;
      answer?: string;
    }>(req);

    if (!body.step || body.step < 1 || body.step > 5) {
      sendError(res, "step must be 1-5", 400);
      return;
    }

    try {
      const result = await handleOnboardingAnswer({
        userId,
        deviceId,
        step: body.step,
        answer: body.answer ?? "",
      });
      sendJson(res, result);
    } catch (err: any) {
      console.error("[onboarding] Error:", err);
      sendError(res, err.message, 500);
    }
  });

  /**
   * POST /api/v1/onboarding/welcome-seed
   * 手动触发欢迎日记种子（幂等，已存在则跳过）
   */
  router.post("/api/v1/onboarding/welcome-seed", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);

    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    try {
      const result = await seedWelcomeDiaries(userId, deviceId);
      sendJson(res, result);
    } catch (err: any) {
      console.error("[welcome-seed] Error:", err);
      sendError(res, err.message, 500);
    }
  });
}
