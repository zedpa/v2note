/**
 * Notification REST routes — 通知列表 + 已读管理
 */
import { sendJson, sendError, getDeviceId, getUserId } from "../lib/http-helpers.js";
import * as notificationRepo from "../db/repositories/notification.js";
export function registerNotificationRoutes(router) {
    // GET /api/v1/notifications — 获取通知列表
    router.get("/api/v1/notifications", async (req, res, _params, qry) => {
        try {
            const deviceId = getDeviceId(req);
            const userId = getUserId(req);
            const limit = parseInt(qry.limit || "50", 10);
            const [notifications, unreadCount] = await Promise.all([
                userId
                    ? notificationRepo.findByUser(userId, limit)
                    : notificationRepo.findByDevice(deviceId, limit),
                userId
                    ? notificationRepo.countUnreadByUser(userId)
                    : notificationRepo.countUnread(deviceId),
            ]);
            sendJson(res, { notifications, unread_count: unreadCount });
        }
        catch (err) {
            sendError(res, err.message ?? "Internal error", err.status ?? 500);
        }
    });
    // PATCH /api/v1/notifications/:id/read — 标记单条已读
    router.patch("/api/v1/notifications/:id/read", async (_req, res, params) => {
        try {
            await notificationRepo.markRead(params.id);
            sendJson(res, { ok: true });
        }
        catch (err) {
            sendError(res, err.message ?? "Internal error", err.status ?? 500);
        }
    });
    // POST /api/v1/notifications/read-all — 标记全部已读
    router.post("/api/v1/notifications/read-all", async (req, res) => {
        try {
            const deviceId = getDeviceId(req);
            const userId = getUserId(req);
            if (userId) {
                await notificationRepo.markAllReadByUser(userId);
            }
            else {
                await notificationRepo.markAllRead(deviceId);
            }
            sendJson(res, { ok: true });
        }
        catch (err) {
            sendError(res, err.message ?? "Internal error", err.status ?? 500);
        }
    });
}
//# sourceMappingURL=notifications.js.map