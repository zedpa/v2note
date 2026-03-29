import { sendJson, sendError, getUserId, getDeviceId } from "../lib/http-helpers.js";
import { readBody } from "../lib/http-helpers.js";
import { handleOnboardingAnswer } from "../handlers/onboarding.js";
export function registerOnboardingRoutes(router) {
    /**
     * POST /api/v1/onboarding/answer
     * 处理冷启动 5 问的每步回答。
     */
    router.post("/api/v1/onboarding/answer", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const body = await readBody(req);
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
        }
        catch (err) {
            console.error("[onboarding] Error:", err);
            sendError(res, err.message, 500);
        }
    });
}
//# sourceMappingURL=onboarding.js.map