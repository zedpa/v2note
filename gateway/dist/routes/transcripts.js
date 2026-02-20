import { readBody, sendJson, sendError } from "../lib/http-helpers.js";
import { transcriptRepo, summaryRepo } from "../db/repositories/index.js";
export function registerTranscriptRoutes(router) {
    // Get transcript
    router.get("/api/v1/records/:id/transcript", async (_req, res, params) => {
        const transcript = await transcriptRepo.findByRecordId(params.id);
        if (!transcript) {
            sendError(res, "Transcript not found", 404);
            return;
        }
        sendJson(res, transcript);
    });
    // Create transcript
    router.post("/api/v1/records/:id/transcript", async (req, res, params) => {
        const { text, language } = await readBody(req);
        const transcript = await transcriptRepo.create({
            record_id: params.id,
            text,
            language,
        });
        sendJson(res, transcript, 201);
    });
    // Get summary
    router.get("/api/v1/records/:id/summary", async (_req, res, params) => {
        const summary = await summaryRepo.findByRecordId(params.id);
        if (!summary) {
            sendError(res, "Summary not found", 404);
            return;
        }
        sendJson(res, summary);
    });
    // Update summary
    router.patch("/api/v1/records/:id/summary", async (req, res, params) => {
        const body = await readBody(req);
        await summaryRepo.update(params.id, body);
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=transcripts.js.map