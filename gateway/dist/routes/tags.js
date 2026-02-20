import { readBody, sendJson } from "../lib/http-helpers.js";
import { tagRepo } from "../db/repositories/index.js";
export function registerTagRoutes(router) {
    // Add tag to record
    router.post("/api/v1/records/:id/tags", async (req, res, params) => {
        const { name } = await readBody(req);
        const tag = await tagRepo.upsert(name);
        await tagRepo.addToRecord(params.id, tag.id);
        sendJson(res, { ok: true }, 201);
    });
    // Remove tag from record
    router.delete("/api/v1/records/:id/tags/:tagId", async (_req, res, params) => {
        await tagRepo.removeFromRecord(params.id, params.tagId);
        sendJson(res, { ok: true });
    });
    // List all tags
    router.get("/api/v1/tags", async (_req, res) => {
        const tags = await tagRepo.findAll();
        sendJson(res, tags);
    });
}
//# sourceMappingURL=tags.js.map