import { sendJson, sendError } from "../lib/http-helpers.js";
export function registerCognitiveClusterRoutes(router) {
    // List clusters — @deprecated 返回空列表
    router.get("/api/v1/cognitive/clusters", async (_req, res) => {
        sendJson(res, []);
    });
    // Cluster detail — @deprecated 返回 410
    router.get("/api/v1/cognitive/clusters/:id", async (_req, res) => {
        sendError(res, "Cluster engine deprecated", 410);
    });
    // Update cluster name — @deprecated
    router.patch("/api/v1/cognitive/clusters/:id", async (_req, res) => {
        sendError(res, "Cluster engine deprecated", 410);
    });
    // Dissolve cluster — @deprecated
    router.delete("/api/v1/cognitive/clusters/:id", async (_req, res) => {
        sendError(res, "Cluster engine deprecated", 410);
    });
    // Create bond — @deprecated
    router.post("/api/v1/cognitive/bonds", async (_req, res) => {
        sendError(res, "Bond engine deprecated", 410);
    });
}
//# sourceMappingURL=cognitive-clusters.js.map