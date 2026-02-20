import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { ideaRepo } from "../db/repositories/index.js";
export function registerIdeaRoutes(router) {
    // List ideas
    router.get("/api/v1/ideas", async (req, res) => {
        const deviceId = getDeviceId(req);
        const ideas = await ideaRepo.findByDevice(deviceId);
        sendJson(res, ideas);
    });
    // Create idea
    router.post("/api/v1/ideas", async (req, res) => {
        const { record_id, text } = await readBody(req);
        const idea = await ideaRepo.create({ record_id, text });
        sendJson(res, { id: idea.id }, 201);
    });
    // Delete idea
    router.delete("/api/v1/ideas/:id", async (_req, res, params) => {
        await ideaRepo.del(params.id);
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=ideas.js.map