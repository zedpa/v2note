import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
} from "../db/repositories/index.js";
import { digestRecords } from "../handlers/digest.js";
import { describeImage } from "../ai/vision.js";
import { uploadFile, isOssConfigured } from "../storage/oss.js";
import { extractUrl } from "../ingest/url-extractor.js";
import { parseFile } from "../ingest/file-parser.js";

type IngestType = "text" | "image" | "file" | "url" | "audio";

interface IngestBody {
  type: IngestType;
  content?: string;
  file_base64?: string;
  filename?: string;
  mimeType?: string;
  source_type?: "think" | "material";
  metadata?: string;
}

export function registerIngestRoutes(router: Router) {
  router.post("/api/v1/ingest", async (req, res) => {
    const userId = getUserId(req);
    const deviceId = getDeviceId(req);
    const body = await readBody<IngestBody>(req);

    if (!body.type) {
      sendJson(res, { error: "type is required" }, 400);
      return;
    }

    switch (body.type) {
      case "text": {
        if (!body.content) {
          sendJson(res, { error: "content is required for type=text" }, 400);
          return;
        }

        const record = await recordRepo.create({
          device_id: deviceId,
          user_id: userId ?? undefined,
          status: "completed",
          source: "manual",
          source_type: body.source_type ?? "think",
        });

        await transcriptRepo.create({
          record_id: record.id,
          text: body.content,
        });

        await summaryRepo.create({
          record_id: record.id,
          title: body.content.slice(0, 50),
          short_summary: body.content,
        });

        // Trigger digest in background
        digestRecords([record.id], { deviceId, userId: userId ?? undefined }).catch(
          (err) => console.error("[ingest] digest failed:", err),
        );

        sendJson(res, { recordId: record.id, status: "processing" }, 201);
        break;
      }

      case "image": {
        if (!body.file_base64) {
          sendJson(res, { error: "file_base64 is required for type=image" }, 400);
          return;
        }

        // Determine image URL: upload to OSS if configured, otherwise use data URL
        let imageUrl: string;
        if (isOssConfigured()) {
          const buf = Buffer.from(body.file_base64, "base64");
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `${deviceId}-${timestamp}.jpg`;
          imageUrl = await uploadFile("images", filename, buf);
        } else {
          imageUrl = `data:image/jpeg;base64,${body.file_base64}`;
        }

        const description = await describeImage(imageUrl);

        const imgRecord = await recordRepo.create({
          device_id: deviceId,
          user_id: userId ?? undefined,
          status: "completed",
          source: "manual",
          source_type: "material",
        });

        await transcriptRepo.create({
          record_id: imgRecord.id,
          text: description,
        });

        await summaryRepo.create({
          record_id: imgRecord.id,
          title: description.slice(0, 50),
          short_summary: description,
        });

        digestRecords([imgRecord.id], { deviceId, userId: userId ?? undefined }).catch(
          (err) => console.error("[ingest] digest failed:", err),
        );

        sendJson(res, { recordId: imgRecord.id, status: "processing", description }, 201);
        break;
      }

      case "file": {
        if (!body.file_base64 || !body.filename || !body.mimeType) {
          sendJson(res, { error: "file_base64, filename, and mimeType are required for type=file" }, 400);
          return;
        }

        const fileBuf = Buffer.from(body.file_base64, "base64");
        const content = await parseFile(fileBuf, body.filename, body.mimeType);

        // Upload to OSS if configured
        if (isOssConfigured()) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const ossName = `${deviceId}-${timestamp}-${body.filename}`;
          await uploadFile("files", ossName, fileBuf);
        }

        const fileRecord = await recordRepo.create({
          device_id: deviceId,
          user_id: userId ?? undefined,
          status: "completed",
          source: "manual",
          source_type: "material",
        });

        await transcriptRepo.create({
          record_id: fileRecord.id,
          text: content,
        });

        await summaryRepo.create({
          record_id: fileRecord.id,
          title: body.filename,
          short_summary: content.slice(0, 200),
        });

        digestRecords([fileRecord.id], { deviceId, userId: userId ?? undefined }).catch(
          (err) => console.error("[ingest] digest failed:", err),
        );

        sendJson(res, {
          recordId: fileRecord.id,
          status: "processing",
          filename: body.filename,
          preview: content.slice(0, 200),
        }, 201);
        break;
      }

      case "url": {
        if (!body.content) {
          sendJson(res, { error: "content (URL) is required for type=url" }, 400);
          return;
        }

        const { title, content: extracted, image } = await extractUrl(body.content);

        const urlRecord = await recordRepo.create({
          device_id: deviceId,
          user_id: userId ?? undefined,
          status: "completed",
          source: "manual",
          source_type: "material",
        });

        await transcriptRepo.create({
          record_id: urlRecord.id,
          text: extracted,
        });

        await summaryRepo.create({
          record_id: urlRecord.id,
          title,
          short_summary: extracted.slice(0, 200),
        });

        digestRecords([urlRecord.id], { deviceId, userId: userId ?? undefined }).catch(
          (err) => console.error("[ingest] digest failed:", err),
        );

        sendJson(res, {
          recordId: urlRecord.id,
          status: "processing",
          title,
          preview: extracted.slice(0, 200),
        }, 201);
        break;
      }

      case "audio":
        sendJson(res, { error: "Use existing /process endpoint for audio" }, 400);
        break;

      default:
        sendJson(res, { error: `Unknown type: ${body.type}` }, 400);
        break;
    }
  });
}
