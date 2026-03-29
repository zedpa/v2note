import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
  tagRepo,
  todoRepo,
  ideaRepo,
} from "../db/repositories/index.js";
import { processEntry } from "../handlers/process.js";

export function registerRecordRoutes(router: Router) {
  // Get signed audio URL for a record
  router.get("/api/v1/records/:id/audio", async (_req, res, params) => {
    const record = await recordRepo.findById(params.id);
    if (!record || !record.audio_path) {
      sendJson(res, { error: "Audio not found" }, 404);
      return;
    }
    try {
      const { getSignedUrl, isOssConfigured } = await import("../storage/oss.js");
      if (!isOssConfigured()) {
        sendJson(res, { error: "OSS not configured" }, 500);
        return;
      }
      const url = await getSignedUrl(record.audio_path);
      sendJson(res, { url });
    } catch (err: any) {
      sendJson(res, { error: err.message }, 500);
    }
  });

  // List records (with summary + tags)
  router.get("/api/v1/records", async (req, res, _params, query) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const limit = parseInt(query.limit ?? "100", 10);
    const offset = parseInt(query.offset ?? "0", 10);
    const notebook = query.notebook;
    const records = userId
      ? await recordRepo.findByUser(userId, {
          archived: false,
          limit,
          offset,
          notebook: notebook !== undefined ? notebook : undefined,
        })
      : await recordRepo.findByDevice(deviceId, {
          archived: false,
          limit,
          offset,
          notebook: notebook !== undefined ? notebook : undefined,
        });

    // 批量加载关联数据（3 次查询，替代 N+1）
    const ids = records.map((r) => r.id);
    const [summaries, transcripts, tagRows] = await Promise.all([
      ids.length > 0 ? summaryRepo.findByRecordIds(ids) : [],
      ids.length > 0 ? transcriptRepo.findByRecordIds(ids) : [],
      ids.length > 0 ? tagRepo.findByRecordIds(ids) : [],
    ]);

    // 按 record_id 分组 tags
    const tagMap: Record<string, Array<{ id: string; name: string }>> = {};
    for (const row of tagRows) {
      if (!tagMap[row.record_id]) tagMap[row.record_id] = [];
      tagMap[row.record_id].push({ id: row.id, name: row.name });
    }
    const summaryMap = Object.fromEntries(
      summaries.map((s) => [s.record_id, s]),
    );
    const transcriptMap = Object.fromEntries(
      transcripts.map((t) => [t.record_id, t]),
    );

    const items = records.map((r) => ({
      ...r,
      summary: summaryMap[r.id] ?? null,
      transcript: transcriptMap[r.id] ?? null,
      tags: tagMap[r.id] ?? [],
    }));

    sendJson(res, items);
  });

  // Search records (must be before :id to avoid "search" being captured as an id)
  router.get("/api/v1/records/search", async (req, res, _params, query) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const q = query.q ?? "";
    if (!q) {
      sendJson(res, []);
      return;
    }
    const records = userId
      ? await recordRepo.searchByUser(userId, q)
      : await recordRepo.search(deviceId, q);

    // Batch load summaries and tags (same as list route)
    const ids = records.map((r) => r.id);
    const [summaries, tagsByRecord] = await Promise.all([
      ids.length > 0
        ? Promise.all(ids.map((id) => summaryRepo.findByRecordId(id)))
        : [],
      ids.length > 0
        ? Promise.all(
            ids.map((id) =>
              tagRepo.findByRecordId(id).then((tags) => ({ id, tags })),
            ),
          )
        : [],
    ]);

    const summaryMap = Object.fromEntries(
      summaries.filter(Boolean).map((s) => [s!.record_id, s]),
    );
    const tagMap = Object.fromEntries(
      tagsByRecord.map((t) => [t.id, t.tags]),
    );

    const items = records.map((r) => ({
      ...r,
      summary: summaryMap[r.id] ?? null,
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
    const userId = getUserId(req);
    const body = await readBody<{
      status?: string;
      source?: string;
      location_text?: string;
    }>(req);
    const record = await recordRepo.create({ device_id: deviceId, user_id: userId ?? undefined, ...body });
    sendJson(res, { id: record.id }, 201);
  });

  // Create manual note (content + optional AI processing)
  router.post("/api/v1/records/manual", async (req, res) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req) ?? undefined;
    const { content, tags, useAi, notebook } = await readBody<{
      content: string;
      tags?: string[];
      useAi?: boolean;
      notebook?: string;
    }>(req);

    const record = await recordRepo.create({
      device_id: deviceId,
      user_id: userId,
      status: useAi ? "processing" : "completed",
      source: "manual",
      notebook: notebook || undefined,
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
        userId,
        recordId: record.id,
        notebook: notebook || undefined,
      }).catch((err) => console.error("[records/manual] AI processing failed:", err));
    }

    sendJson(res, { id: record.id }, 201);
  });

  // Update record
  router.patch("/api/v1/records/:id", async (req, res, params) => {
    const body = await readBody<{
      status?: string;
      archived?: boolean;
      duration_seconds?: number;
      short_summary?: string;
    }>(req);

    const { short_summary, ...recordFields } = body;
    if (Object.keys(recordFields).length > 0) {
      await recordRepo.updateFields(params.id, recordFields);
    }
    if (short_summary !== undefined) {
      await summaryRepo.update(params.id, { short_summary });
    }
    sendJson(res, { ok: true });
  });

  // Toggle source_type
  router.patch("/api/v1/records/:id/source-type", async (req, res, params) => {
    const { source_type } = await readBody<{ source_type: "think" | "material" }>(req);
    if (!source_type || !["think", "material"].includes(source_type)) {
      sendJson(res, { error: "source_type must be 'think' or 'material'" }, 400);
      return;
    }
    await recordRepo.updateFields(params.id, { source_type });
    sendJson(res, { ok: true });
  });

  // Delete records
  router.delete("/api/v1/records", async (req, res) => {
    const { ids } = await readBody<{ ids: string[] }>(req);
    const count = await recordRepo.deleteByIds(ids ?? []);
    sendJson(res, { deleted: count });
  });

}
