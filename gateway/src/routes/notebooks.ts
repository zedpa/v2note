import type { Router } from "../router.js";
import { sendJson, sendError, getDeviceId, getUserId, readBody } from "../lib/http-helpers.js";
import { notebookRepo, aiDiaryRepo } from "../db/repositories/index.js";
import { today, daysAgo } from "../lib/tz.js";

export function registerNotebookRoutes(router: Router) {
  // List notebooks
  router.get("/api/v1/notebooks", async (req, res) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    if (userId) {
      await notebookRepo.ensureSystemNotebooksByUser(userId, deviceId);
      const notebooks = await notebookRepo.findByUser(userId);
      sendJson(res, notebooks);
    } else {
      await notebookRepo.ensureSystemNotebooks(deviceId);
      const notebooks = await notebookRepo.findByDevice(deviceId);
      sendJson(res, notebooks);
    }
  });

  // Create notebook
  router.post("/api/v1/notebooks", async (req, res) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const body = await readBody<{ name: string; description?: string; color?: string }>(req);
    if (!body.name?.trim()) {
      sendError(res, "name is required", 400);
      return;
    }
    const nb = userId
      ? await notebookRepo.findOrCreateByUser(userId, deviceId, body.name.trim(), body.description?.trim(), false, body.color?.trim())
      : await notebookRepo.findOrCreate(deviceId, body.name.trim(), body.description?.trim(), false, body.color?.trim());
    sendJson(res, nb, 201);
  });

  // Update notebook (rename / change description; system notebooks protected)
  router.patch("/api/v1/notebooks/:id", async (req, res, params) => {
    const body = await readBody<{ name?: string; description?: string; color?: string }>(req);
    const updated = await notebookRepo.update(params.id, body);
    if (!updated) {
      sendError(res, "Notebook not found or is a system notebook", 404);
      return;
    }
    sendJson(res, updated);
  });

  // Delete notebook (system notebooks protected)
  router.delete("/api/v1/notebooks/:id", async (req, res, params) => {
    const deleted = await notebookRepo.deleteById(params.id);
    if (!deleted) {
      sendError(res, "Notebook not found or is a system notebook", 404);
      return;
    }
    sendJson(res, { ok: true });
  });

  // Get diary entry for a specific notebook and date
  router.get("/api/v1/diary/:notebook/:date", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const entry = userId
      ? await aiDiaryRepo.findFullByUser(userId, params.notebook, params.date)
      : await aiDiaryRepo.findFull(deviceId, params.notebook, params.date);
    sendJson(res, entry ?? { device_id: deviceId, notebook: params.notebook, entry_date: params.date, summary: "", full_content: "" });
  });

  // List diary summaries for a notebook (query: start, end)
  router.get("/api/v1/diary/:notebook", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const start = url.searchParams.get("start") ?? daysAgo(30);
    const end = url.searchParams.get("end") ?? today();
    const summaries = userId
      ? await aiDiaryRepo.findSummariesByUser(userId, params.notebook, start, end)
      : await aiDiaryRepo.findSummaries(deviceId, params.notebook, start, end);
    sendJson(res, summaries);
  });
}
