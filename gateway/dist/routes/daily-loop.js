import { sendJson, sendError, getDeviceId, getUserId, HttpError } from "../lib/http-helpers.js";
import { generateMorningBriefing, generateEveningSummary } from "../handlers/daily-loop.js";
import { generateReport } from "../handlers/report.js";
import { todoRepo } from "../db/repositories/index.js";
import { onTodoComplete } from "../cognitive/todo-projector.js";
export function registerDailyLoopRoutes(router) {
    // Morning briefing
    router.get("/api/v1/daily/briefing", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const userId = getUserId(req);
            const url = new URL(req.url ?? "", `http://${req.headers.host}`);
            const forceRefresh = url.searchParams.get("refresh") === "true";
            const briefing = await generateMorningBriefing(deviceId, userId ?? undefined, forceRefresh);
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
            const userId = getUserId(req);
            const url = new URL(req.url ?? "", `http://${req.headers.host}`);
            const forceRefresh = url.searchParams.get("refresh") === "true";
            const summary = await generateEveningSummary(deviceId, userId ?? undefined, forceRefresh);
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
            const userId = getUserId(req);
            const relays = userId
                ? await todoRepo.findRelayByUser(userId)
                : await todoRepo.findRelayByDevice(deviceId);
            sendJson(res, relays);
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            sendError(res, err.message, status);
        }
    });
    // Unified report API (new)
    router.get("/api/v1/report", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const userId = getUserId(req);
            const url = new URL(req.url ?? "", `http://${req.headers.host}`);
            const mode = url.searchParams.get("mode") ?? "auto";
            const report = await generateReport(mode, deviceId, userId ?? undefined);
            sendJson(res, report);
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            console.error(`[report] Error (${status}):`, err.message);
            sendError(res, err.message, status);
        }
    });
    // Mark relay as completed
    router.patch("/api/v1/daily/relays/:id", async (req, res, params) => {
        try {
            await todoRepo.update(params.id, { done: true });
            onTodoComplete(params.id).catch((e) => console.error("[daily-loop] onTodoComplete failed:", e));
            sendJson(res, { ok: true });
        }
        catch (err) {
            sendError(res, err.message, 500);
        }
    });
}
//# sourceMappingURL=daily-loop.js.map