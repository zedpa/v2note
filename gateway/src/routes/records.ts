import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
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
import { isValidClientId } from "../lib/client-id.js";

/**
 * A1（fix-cold-resume-silent-loss Phase 3）：
 * POST /records 并发时可能两条同 (userId, client_id) 请求都 miss 了 findByClientId，
 * 导致第二条 INSERT 撞 partial unique index 抛 Postgres 23505。
 * 原先会冒泡成 500，触发前端重试风暴。
 *
 * 捕获到约束冲突后回退一次 findByClientId 返回已存在行，语义等同于"幂等成功"。
 * 错误形状：pg 错误对象带 code="23505"，constraint 字段含 "client_id"。
 */
function isClientIdUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; constraint?: unknown; detail?: unknown };
  if (e.code !== "23505") return false;
  const constraint = typeof e.constraint === "string" ? e.constraint : "";
  const detail = typeof e.detail === "string" ? e.detail : "";
  // 生产索引名称未知，放宽匹配：只要约束名/detail 包含 client_id 即判定
  return constraint.includes("client_id") || detail.includes("client_id");
}

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
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
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
      records = await recordRepo.findByUser(userId, {
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
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const q = query.q ?? "";
    if (!q) {
      sendJson(res, []);
      return;
    }
    const records = await recordRepo.searchByUser(userId, q);

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

    let fileUrl = record.file_url;
    if (isOssConfigured() && fileUrl && fileUrl.startsWith("http") && !fileUrl.startsWith("data:")) {
      try { fileUrl = await getSignedUrl(fileUrl); } catch { /* keep original */ }
    }

    sendJson(res, { ...record, file_url: fileUrl, transcript, summary, tags, todos, ideas });
  });

  // Create record
  // 支持 client_id 幂等（见 fix-cold-resume-silent-loss §6）：
  //   - 同一 (userId, client_id) 的重复 POST → 直接返回已有行，不创建
  //   - 未携带 client_id 时退化为普通创建（向后兼容）
  //   - A2: client_id 格式非法 → 视为未传（warn 日志后走普通创建），不阻塞请求
  //   - A1: create 触发 23505 → 回退 find 返回已有行（幂等成功，200 OK）
  router.post("/api/v1/records", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const body = await readBody<{
      status?: string;
      source?: string;
      location_text?: string;
      duration_seconds?: number;
      notebook?: string;
      client_id?: string;
    }>(req);

    // A2: client_id 格式校验。非法值 → 剔除后走普通创建，不阻塞。
    let clientId: string | null = null;
    if (body.client_id !== undefined && body.client_id !== null) {
      if (isValidClientId(body.client_id)) {
        clientId = body.client_id;
      } else {
        const raw: unknown = body.client_id;
        const preview: string =
          typeof raw === "string" ? (raw as string).slice(0, 40) : typeof raw;
        console.warn(`[records] invalid client_id rejected (user=${userId}): ${preview}`);
      }
    }

    // 幂等短路：命中已有行直接回放
    if (clientId) {
      const existing = await recordRepo.findByClientId(userId, clientId);
      if (existing) {
        sendJson(res, { ...existing, id: existing.id, client_id: existing.client_id });
        return;
      }
    }

    const { client_id: _omit, ...rest } = body;
    try {
      const record = await recordRepo.create({
        device_id: undefined,
        user_id: userId,
        ...rest,
        client_id: clientId,
      });
      sendJson(res, { id: record.id, client_id: record.client_id ?? clientId ?? null }, 201);
    } catch (err) {
      // A1: 并发插入撞 partial unique index → 回退 find，返回已有行
      if (clientId && isClientIdUniqueViolation(err)) {
        const existing = await recordRepo.findByClientId(userId, clientId);
        if (existing) {
          console.warn(
            `[records] 23505 race resolved by idempotent replay (user=${userId}, client_id=${clientId})`,
          );
          sendJson(res, { ...existing, id: existing.id, client_id: existing.client_id });
          return;
        }
      }
      throw err;
    }
  });

  // Retry audio: receive WAV, transcribe, process
  router.post("/api/v1/records/:id/retry-audio", async (req, res, params) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }

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
      const vocabularyId = await getVocabularyIdForDevice(userId);

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
          const audioUrl = await uploadPCM(userId, [pcmData]);
          await recordRepo.updateFields(record.id, { audio_path: audioUrl });
        }
      } catch (err) {
        console.error("[retry-audio] OSS upload failed:", err);
      }

      // 触发 AI 处理（后台）
      processEntry({
        text: transcript,
        deviceId: userId,
        userId,
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
  // 支持 client_id 幂等（同 POST /records）：
  //   - 命中已有 (userId, client_id) 直接回放，不重复写入 transcript/summary/tags
  //   - A2: 非法 client_id 忽略（走普通创建）
  //   - A1: create 并发撞 23505 → 回退 find 返回已有行，跳过 transcript/summary 重复写入
  router.post("/api/v1/records/manual", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const { content, tags, useAi, notebook, client_id } = await readBody<{
      content: string;
      tags?: string[];
      useAi?: boolean;
      notebook?: string;
      client_id?: string;
    }>(req);

    // A2: client_id 格式校验
    let clientId: string | null = null;
    if (client_id !== undefined && client_id !== null) {
      if (isValidClientId(client_id)) {
        clientId = client_id;
      } else {
        const raw: unknown = client_id;
        const preview: string =
          typeof raw === "string" ? (raw as string).slice(0, 40) : typeof raw;
        console.warn(
          `[records/manual] invalid client_id rejected (user=${userId}): ${preview}`,
        );
      }
    }

    // 幂等短路
    if (clientId) {
      const existing = await recordRepo.findByClientId(userId, clientId);
      if (existing) {
        sendJson(res, { ...existing, id: existing.id, client_id: existing.client_id });
        return;
      }
    }

    let record;
    try {
      record = await recordRepo.create({
        device_id: undefined,
        user_id: userId,
        status: useAi ? "processing" : "completed",
        source: "manual",
        notebook: notebook || undefined,
        client_id: clientId,
      });
    } catch (err) {
      // A1: 并发 23505 → 回退 find，若命中则返回已有行并**跳过**后续 transcript/summary 写入
      if (clientId && isClientIdUniqueViolation(err)) {
        const existing = await recordRepo.findByClientId(userId, clientId);
        if (existing) {
          console.warn(
            `[records/manual] 23505 race resolved by idempotent replay (user=${userId}, client_id=${clientId})`,
          );
          sendJson(res, { ...existing, id: existing.id, client_id: existing.client_id });
          return;
        }
      }
      throw err;
    }

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
        deviceId: userId,
        userId,
        recordId: record.id,
        notebook: notebook || undefined,
      }).catch((err) => console.error("[records/manual] AI processing failed:", err));
    }

    sendJson(res, {
      id: record.id,
      client_id: record.client_id ?? clientId ?? null,
    }, 201);
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
