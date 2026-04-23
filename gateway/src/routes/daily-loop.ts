import type { Router } from "../router.js";
import { sendJson, sendError, getUserId, HttpError } from "../lib/http-helpers.js";
import { generateMorningBriefing, generateEveningSummary } from "../handlers/daily-loop.js";
import { generateReport, resolveMode } from "../handlers/report.js";
import { todoRepo } from "../db/repositories/index.js";
import { onTodoComplete } from "../cognitive/todo-projector.js";

export function registerDailyLoopRoutes(router: Router) {
  // Morning briefing
  router.get("/api/v1/daily/briefing", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) { sendError(res, "Unauthorized", 401); return; }
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      const forceRefresh = url.searchParams.get("refresh") === "true";
      const briefing = await generateMorningBriefing(userId, userId, forceRefresh);
      if (briefing === null) {
        sendJson(res, { disabled: true, reason: "晨间简报已在用户设置中关闭" });
        return;
      }
      sendJson(res, briefing);
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      console.error(`[daily-loop] Briefing error (${status}):`, err.message);
      sendError(res, err.message, status);
    }
  });

  // Evening summary
  router.get("/api/v1/daily/evening-summary", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) { sendError(res, "Unauthorized", 401); return; }
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      const forceRefresh = url.searchParams.get("refresh") === "true";
      const summary = await generateEveningSummary(userId, userId, forceRefresh);
      if (summary === null) {
        sendJson(res, { disabled: true, reason: "晚间回顾已在用户设置中关闭" });
        return;
      }
      sendJson(res, summary);
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      console.error(`[daily-loop] Evening summary error (${status}):`, err.message);
      sendError(res, err.message, status);
    }
  });

  // List pending relays
  router.get("/api/v1/daily/relays", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) { sendError(res, "Unauthorized", 401); return; }
      const relays = await todoRepo.findRelayByUser(userId);
      sendJson(res, relays);
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      sendError(res, err.message, status);
    }
  });

  // Unified report API (new)
  router.get("/api/v1/report", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) { sendError(res, "Unauthorized", 401); return; }
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      const mode = url.searchParams.get("mode") ?? "auto";
      const report = await generateReport(mode, userId, userId);
      // 确保 mode 字段存在（前端 SmartDailyReport 依赖它区分布局）
      if (report && !report.mode) {
        report.mode = resolveMode(new Date().getHours());
      }
      sendJson(res, report);
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      console.error(`[report] Error (${status}):`, err.message);
      sendError(res, err.message, status);
    }
  });

  // Mark relay as completed
  router.patch("/api/v1/daily/relays/:id", async (req, res, params) => {
    try {
      await todoRepo.update(params.id, { done: true });
      onTodoComplete(params.id).catch((e) =>
        console.error("[daily-loop] onTodoComplete failed:", e),
      );
      sendJson(res, { ok: true });
    } catch (err: any) {
      sendError(res, err.message, 500);
    }
  });
}
