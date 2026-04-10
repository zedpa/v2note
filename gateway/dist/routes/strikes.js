import { sendJson, sendError } from "../lib/http-helpers.js";
export function registerStrikeRoutes(router) {
    // GET /api/v1/records/:id/strikes — @deprecated 返回空列表
    router.get("/api/v1/records/:id/strikes", async (_req, res) => {
        sendJson(res, []);
    });
    // GET /api/v1/strikes/:id/trace — @deprecated 返回 404
    router.get("/api/v1/strikes/:id/trace", async (_req, res) => {
        sendError(res, "Strike engine deprecated", 410);
    });
    // POST /api/v1/strikes/:id/undo-supersede — @deprecated
    router.post("/api/v1/strikes/:id/undo-supersede", async (_req, res) => {
        sendError(res, "Strike engine deprecated", 410);
    });
    // GET /api/v1/strikes/supersede-alerts — @deprecated 返回空
    router.get("/api/v1/strikes/supersede-alerts", async (_req, res) => {
        sendJson(res, []);
    });
    // PATCH /api/v1/strikes/:id — @deprecated
    router.patch("/api/v1/strikes/:id", async (_req, res) => {
        sendError(res, "Strike engine deprecated", 410);
    });
}
//# sourceMappingURL=strikes.js.map