/**
 * Notification REST routes — 通知列表 + 已读管理
 */

import type { Router } from "../router.js";
import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import * as notificationRepo from "../db/repositories/notification.js";

export function registerNotificationRoutes(router: Router) {
  // GET /api/v1/notifications — 获取通知列表
  router.get("/api/v1/notifications", async (req, res, _params, qry) => {
    try {
      const userId = getUserId(req);
      if (!userId) { sendError(res, "Unauthorized", 401); return; }
      const limit = parseInt(qry.limit || "50", 10);
      const [notifications, unreadCount] = await Promise.all([
        notificationRepo.findByUser(userId, limit),
        notificationRepo.countUnreadByUser(userId),
      ]);
      sendJson(res, { notifications, unread_count: unreadCount });
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // PATCH /api/v1/notifications/:id/read — 标记单条已读
  router.patch("/api/v1/notifications/:id/read", async (_req, res, params) => {
    try {
      await notificationRepo.markRead(params.id);
      sendJson(res, { ok: true });
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // POST /api/v1/notifications/read-all — 标记全部已读
  router.post("/api/v1/notifications/read-all", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) { sendError(res, "Unauthorized", 401); return; }
      await notificationRepo.markAllReadByUser(userId);
      sendJson(res, { ok: true });
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });
}
