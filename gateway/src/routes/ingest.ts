import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
} from "../db/repositories/index.js";
import { digestRecords } from "../handlers/digest.js";

type IngestType = "text" | "image" | "file" | "url" | "audio";

interface IngestBody {
  type: IngestType;
  content?: string;
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

      case "image":
        sendJson(res, { error: "Image processing not yet implemented" }, 501);
        break;

      case "file":
        sendJson(res, { error: "File processing not yet implemented" }, 501);
        break;

      case "url":
        sendJson(res, { error: "URL processing not yet implemented" }, 501);
        break;

      case "audio":
        sendJson(res, { error: "Use existing /process endpoint for audio" }, 400);
        break;

      default:
        sendJson(res, { error: `Unknown type: ${body.type}` }, 400);
        break;
    }
  });
}
