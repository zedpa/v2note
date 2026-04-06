import { sendJson, sendError, getUserId, HttpError } from "../lib/http-helpers.js";
import { chatMessageRepo } from "../db/repositories/index.js";
export function registerChatRoutes(router) {
    // GET /api/v1/chat/history — 分页加载历史消息
    router.get("/api/v1/chat/history", async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                throw new HttpError(401, "Unauthorized");
            const url = new URL(req.url ?? "", `http://${req.headers.host}`);
            const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 100);
            const before = url.searchParams.get("before") ?? undefined;
            const messages = await chatMessageRepo.getHistory(userId, limit, before);
            sendJson(res, {
                messages: messages.map(m => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    parts: m.parts,
                    created_at: m.created_at,
                })),
                has_more: messages.length === limit,
            });
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            sendError(res, err.message, status);
        }
    });
    // DELETE /api/v1/chat/history — 清空聊天历史
    router.delete("/api/v1/chat/history", async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                throw new HttpError(401, "Unauthorized");
            await chatMessageRepo.deleteAllByUser(userId);
            sendJson(res, { ok: true });
        }
        catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            sendError(res, err.message, status);
        }
    });
}
//# sourceMappingURL=chat.js.map