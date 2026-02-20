import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { recordRepo, transcriptRepo, summaryRepo, tagRepo, todoRepo, ideaRepo, } from "../db/repositories/index.js";
import { processEntry } from "../handlers/process.js";
export function registerRecordRoutes(router) {
    // List records (with summary + tags)
    router.get("/api/v1/records", async (req, res, _params, query) => {
        const deviceId = getDeviceId(req);
        const limit = parseInt(query.limit ?? "100", 10);
        const offset = parseInt(query.offset ?? "0", 10);
        const records = await recordRepo.findByDevice(deviceId, {
            archived: false,
            limit,
            offset,
        });
        // Batch load summaries and tags
        const ids = records.map((r) => r.id);
        const [summaries, transcripts] = await Promise.all([
            ids.length > 0 ? Promise.all(ids.map((id) => summaryRepo.findByRecordId(id))) : [],
            ids.length > 0 ? transcriptRepo.findByRecordIds(ids) : [],
        ]);
        const tagsByRecord = ids.length > 0
            ? await Promise.all(ids.map((id) => tagRepo.findByRecordId(id).then((tags) => ({ id, tags }))))
            : [];
        const tagMap = Object.fromEntries(tagsByRecord.map((t) => [t.id, t.tags]));
        const summaryMap = Object.fromEntries(summaries.filter(Boolean).map((s) => [s.record_id, s]));
        const transcriptMap = Object.fromEntries(transcripts.map((t) => [t.record_id, t]));
        const items = records.map((r) => ({
            ...r,
            summary: summaryMap[r.id] ?? null,
            transcript: transcriptMap[r.id] ?? null,
            tags: tagMap[r.id] ?? [],
        }));
        sendJson(res, items);
    });
    // Get single record (with all associations)
    router.get("/api/v1/records/:id", async (req, res, params) => {
        const record = await recordRepo.findById(params.id);
        if (!record) {
            sendJson(res, { error: "Record not found" }, 404);
            return;
        }
        const [transcript, summary, tags, todos, ideas] = await Promise.all([
            transcriptRepo.findByRecordId(params.id),
            summaryRepo.findByRecordId(params.id),
            tagRepo.findByRecordId(params.id),
            todoRepo.findByRecordId(params.id),
            ideaRepo.findByRecordId(params.id),
        ]);
        sendJson(res, { ...record, transcript, summary, tags, todos, ideas });
    });
    // Create record
    router.post("/api/v1/records", async (req, res) => {
        const deviceId = getDeviceId(req);
        const body = await readBody(req);
        const record = await recordRepo.create({ device_id: deviceId, ...body });
        sendJson(res, { id: record.id }, 201);
    });
    // Create manual note (content + optional AI processing)
    router.post("/api/v1/records/manual", async (req, res) => {
        const deviceId = getDeviceId(req);
        const { content, tags, useAi } = await readBody(req);
        const record = await recordRepo.create({
            device_id: deviceId,
            status: useAi ? "processing" : "completed",
            source: "manual",
        });
        await transcriptRepo.create({ record_id: record.id, text: content, language: "zh" });
        await summaryRepo.create({
            record_id: record.id,
            title: content.slice(0, 50),
            short_summary: content.slice(0, 200),
        });
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                const tag = await tagRepo.upsert(tagName);
                await tagRepo.addToRecord(record.id, tag.id);
            }
        }
        // Optional AI processing in background
        if (useAi) {
            processEntry({
                text: content,
                deviceId,
                recordId: record.id,
            }).catch((err) => console.error("[records/manual] AI processing failed:", err));
        }
        sendJson(res, { id: record.id }, 201);
    });
    // Update record
    router.patch("/api/v1/records/:id", async (req, res, params) => {
        const body = await readBody(req);
        await recordRepo.updateFields(params.id, body);
        sendJson(res, { ok: true });
    });
    // Delete records
    router.delete("/api/v1/records", async (req, res) => {
        const { ids } = await readBody(req);
        const count = await recordRepo.deleteByIds(ids ?? []);
        sendJson(res, { deleted: count });
    });
    // Search records
    router.get("/api/v1/records/search", async (req, res, _params, query) => {
        const deviceId = getDeviceId(req);
        const q = query.q ?? "";
        if (!q) {
            sendJson(res, []);
            return;
        }
        const records = await recordRepo.search(deviceId, q);
        sendJson(res, records);
    });
}
//# sourceMappingURL=records.js.map