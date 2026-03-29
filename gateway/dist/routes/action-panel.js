import { sendJson, sendError, getUserId, readBody } from "../lib/http-helpers.js";
import { computeActionPanel } from "../cognitive/action-panel.js";
import { recordSwipe } from "../cognitive/swipe-tracker.js";
import { gatherDecisionContext, buildDecisionPrompt } from "../cognitive/decision.js";
import { getActionStats, getSkipAlerts } from "../cognitive/action-tracking.js";
import { chatCompletion } from "../ai/provider.js";
export function registerActionPanelRoutes(router) {
    router.get("/api/v1/action-panel", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const panel = await computeActionPanel(userId);
        sendJson(res, panel);
    });
    router.post("/api/v1/action-panel/swipe", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const { strikeId, direction, reason } = await readBody(req);
        await recordSwipe({ userId, strikeId, direction, reason });
        sendJson(res, { ok: true });
    });
    // 行为统计
    router.get("/api/v1/action-panel/stats", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const url = new URL(req.url ?? "", "http://localhost");
        const days = parseInt(url.searchParams.get("days") ?? "14", 10);
        const stats = await getActionStats(userId, days);
        sendJson(res, stats);
    });
    // 跳过 alert（供前端或 daily-loop 使用）
    router.get("/api/v1/action-panel/skip-alerts", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const alerts = await getSkipAlerts(userId);
        sendJson(res, alerts);
    });
    router.post("/api/v1/chat/decision", async (req, res) => {
        const userId = getUserId(req);
        if (!userId) {
            sendError(res, "Unauthorized", 401);
            return;
        }
        const { question } = await readBody(req);
        const ctx = await gatherDecisionContext(question, userId);
        const prompt = buildDecisionPrompt(ctx);
        const response = await chatCompletion([
            { role: "system", content: prompt },
            { role: "user", content: question },
        ], { temperature: 0.7 });
        sendJson(res, { content: response.content });
    });
}
//# sourceMappingURL=action-panel.js.map