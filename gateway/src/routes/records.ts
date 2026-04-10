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
import { getSignedUrl, isOssConfigured } from "../storage/oss.js";

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
    const wikiPageId = query.wiki_page_id;

    let records;

    if (wikiPageId === "__inbox__" && userId) {
      // 收件箱：未关联任何 wiki page 的 records
      const { query: dbQuery } = await import("../db/pool.js");
      records = await dbQuery<any>(
        `SELECT r.* FROM record r
         WHERE r.user_id = $1 AND r.status = 'completed' AND r.archived = false
           AND NOT EXISTS (SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id)
         ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );
    } else if (wikiPageId && userId) {
      // 按 wiki page 过滤：通过 wiki_page_record 关联
      const { query: dbQuery } = await import("../db/pool.js");
      records = await dbQuery<any>(
        `SELECT r.* FROM record r
         JOIN wiki_page_record wpr ON wpr.record_id = r.id
         WHERE r.user_id = $1 AND wpr.wiki_page_id = $2
           AND r.status = 'completed' AND r.archived = false
         ORDER BY r.created_at DESC LIMIT $3 OFFSET $4`,
        [userId, wikiPageId, limit, offset],
      );
    } else {
      records = userId
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
    }

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

    // 为 OSS 图片 URL 生成签名（私有 bucket 需要签名才能访问）
    const needSign = isOssConfigured();
    const items = await Promise.all(
      records.map(async (r) => {
        let fileUrl = r.file_url;
        if (needSign && fileUrl && fileUrl.startsWith("http") && !fileUrl.startsWith("data:")) {
          try {
            fileUrl = await getSignedUrl(fileUrl);
          } catch { /* 签名失败保留原 URL */ }
        }
        return {
          ...r,
          file_url: fileUrl,
          summary: summaryMap[r.id] ?? null,
          transcript: transcriptMap[r.id] ?? null,
          tags: tagMap[r.id] ?? [],
        };
      }),
    );

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

  // 获取用户的 domain 列表 + 每个 domain 的记录数（侧边栏文件夹）
  router.get("/api/v1/records/domains", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, { domains: [] });
      return;
    }
    const domains = await recordRepo.listUserDomainsWithCount(userId);
    sendJson(res, { domains });
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

    let fileUrl = record.file_url;
    if (isOssConfigured() && fileUrl && fileUrl.startsWith("http") && !fileUrl.startsWith("data:")) {
      try { fileUrl = await getSignedUrl(fileUrl); } catch { /* keep original */ }
    }

    sendJson(res, { ...record, file_url: fileUrl, transcript, summary, tags, todos, ideas });
  });

  // Create record
  router.post("/api/v1/records", async (req, res) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);
    const body = await readBody<{
      status?: string;
      source?: string;
      location_text?: string;
      duration_seconds?: number;
      notebook?: string;
    }>(req);
    const record = await recordRepo.create({ device_id: deviceId, user_id: userId ?? undefined, ...body });
    sendJson(res, { id: record.id }, 201);
  });

  // Retry audio: receive WAV, transcribe, process
  router.post("/api/v1/records/:id/retry-audio", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    const userId = getUserId(req);

    const record = await recordRepo.findById(params.id);
    if (!record) {
      sendJson(res, { error: "Record not found" }, 404);
      return;
    }
    if (record.status !== "pending_retry") {
      sendJson(res, { error: "Record already processed" }, 409);
      return;
    }

    try {
      // 读取 request body 为 Buffer（WAV 二进制数据）
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const wavBuffer = Buffer.concat(chunks);

      if (wavBuffer.length < 100) {
        sendJson(res, { error: "Audio data too small" }, 400);
        return;
      }

      // 更新 record 状态
      await recordRepo.updateFields(record.id, { status: "processing" });

      // 查询热词
      const { getVocabularyIdForDevice } = await import("../cognitive/vocabulary-sync.js");
      const vocabularyId = await getVocabularyIdForDevice(deviceId);

      // 转写
      const { transcribeAudioFile } = await import("../handlers/asr.js");
      const transcript = await transcribeAudioFile(wavBuffer, vocabularyId);

      if (!transcript.trim()) {
        await recordRepo.updateFields(record.id, { status: "completed" });
        sendJson(res, { recordId: record.id, transcript: "" });
        return;
      }

      // 创建 transcript
      await transcriptRepo.create({
        record_id: record.id,
        text: transcript,
        language: "zh",
      });

      // 上传 OSS
      try {
        const { uploadPCM, isOssConfigured } = await import("../storage/oss.js");
        if (isOssConfigured()) {
          // WAV 去掉 44 字节 header 得到 PCM
          const pcmData = wavBuffer.subarray(44);
          const audioUrl = await uploadPCM(deviceId, [pcmData]);
          await recordRepo.updateFields(record.id, { audio_path: audioUrl });
        }
      } catch (err) {
        console.error("[retry-audio] OSS upload failed:", err);
      }

      // 触发 AI 处理（后台）
      processEntry({
        text: transcript,
        deviceId,
        userId: userId ?? undefined,
        recordId: record.id,
        notebook: record.notebook ?? undefined,
        forceCommand: false,
        sourceContext: "timeline",
      }).catch((err) => {
        console.error("[retry-audio] Process error:", err);
      });

      sendJson(res, { recordId: record.id, transcript });
    } catch (err: any) {
      console.error("[retry-audio] Failed:", err);
      await recordRepo.updateFields(record.id, { status: "pending_retry" });
      sendJson(res, { error: err.message }, 500);
    }
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
      short_summary: content,
    });

    if (tags && tags.length > 0) {
      for (const tagName of tags.slice(0, 5)) {
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
