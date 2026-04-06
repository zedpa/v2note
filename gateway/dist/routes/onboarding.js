import { sendJson, sendError, getUserId, getDeviceId } from "../lib/http-helpers.js";
import { readBody } from "../lib/http-helpers.js";
import { handleOnboardingChat } from "../handlers/onboarding.js";
export function registerOnboardingRoutes(router) {
    /**
     * POST /api/v1/onboarding/chat
     * 两步引导：step 1 存名字，step 2 处理第一条记录。
     */
    router.post("/api/v1/onboarding/chat", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const body = await readBody(req);
        if (!body.step || body.step < 1 || body.step > 2) {
            sendError(res, "step must be 1-2", 400);
            return;
        }
        try {
            const result = await handleOnboardingChat({
                userId,
                deviceId,
                step: body.step,
                answer: body.answer ?? "",
            });
            sendJson(res, result);
        }
        catch (err) {
            console.error("[onboarding/chat] Error:", err);
            sendError(res, err.message, 500);
        }
    });
}
//# sourceMappingURL=onboarding.js.map