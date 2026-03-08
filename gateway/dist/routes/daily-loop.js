import { sendJson, sendError, getDeviceId, HttpError } from "../lib/http-helpers.js";
import { generateMorningBriefing, generateEveningSummary } from "../handlers/daily-loop.js";
import { todoRepo } from "../db/repositories/index.js";
export function registerDailyLoopRoutes(router) {
    // Morning briefing
    router.get("/api/v1/daily/briefing", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const briefing = await generateMorningBriefing(deviceId);
            sendJson(res, briefing);
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            console.error(`[daily-loop] Briefing error (${status}):`, err.message);
            sendError(res, err.message, status);
        }
    });
    // Evening summary
    router.get("/api/v1/daily/evening-summary", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const summary = await generateEveningSummary(deviceId);
            sendJson(res, summary);
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            console.error(`[daily-loop] Evening summary error (${status}):`, err.message);
            sendError(res, err.message, status);
        }
    });
    // List pending relays
    router.get("/api/v1/daily/relays", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const relays = await todoRepo.findRelayByDevice(deviceId);
            sendJson(res, relays);
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            sendError(res, err.message, status);
        }
    });
    // Mark relay as completed
    router.patch("/api/v1/daily/relays/:id", async (req, res, params) => {
        try {
            await todoRepo.update(params.id, { done: true });
            sendJson(res, { ok: true });
        }
        catch (err) {
            sendError(res, err.message, 500);
        }
    });
}
//# sourceMappingURL=daily-loop.js.map