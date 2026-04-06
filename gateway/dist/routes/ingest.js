import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { recordRepo, transcriptRepo, summaryRepo, } from "../db/repositories/index.js";
import { digestRecords } from "../handlers/digest.js";
import { describeImage } from "../ai/vision.js";
import { uploadFile, isOssConfigured } from "../storage/oss.js";
import { extractUrl } from "../ingest/url-extractor.js";
import { parseFile } from "../ingest/file-parser.js";
// 50MB base64 ≈ 37.5MB decoded
const MAX_BASE64_LENGTH = 50 * 1024 * 1024;
// Text content max 100KB
const MAX_TEXT_LENGTH = 100_000;
function isValidBase64(str) {
    if (str.length > MAX_BASE64_LENGTH)
        return false;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}
export function registerIngestRoutes(router) {
    router.post("/api/v1/ingest", async (req, res) => {
        const userId = getUserId(req);
        const deviceId = getDeviceId(req);
        const body = await readBody(req);
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
                if (body.content.length > MAX_TEXT_LENGTH) {
                    sendJson(res, { error: `content exceeds max length (${MAX_TEXT_LENGTH} chars)` }, 400);
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
                digestRecords([record.id], { deviceId, userId: userId ?? undefined }).catch((err) => console.error("[ingest] digest failed for record", record.id, ":", err));
                sendJson(res, { recordId: record.id, status: "processing" }, 201);
                break;
            }
            case "image": {
                if (!body.file_base64) {
                    sendJson(res, { error: "file_base64 is required for type=image" }, 400);
                    return;
                }
                if (!isValidBase64(body.file_base64)) {
                    sendJson(res, { error: "file_base64 is invalid or exceeds size limit (50MB)" }, 400);
                    return;
                }
                let imageUrl;
                const buf = Buffer.from(body.file_base64, "base64");
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const imgFileName = `${deviceId}-${timestamp}.jpg`;
                if (isOssConfigured()) {
                    try {
                        imageUrl = await uploadFile("images", imgFileName, buf);
                    }
                    catch (err) {
                        console.error("[ingest] OSS upload failed, using data URL fallback:", err);
                        imageUrl = `data:image/jpeg;base64,${body.file_base64}`;
                    }
                }
                else {
                    imageUrl = `data:image/jpeg;base64,${body.file_base64}`;
                }
                const visionResult = await describeImage(imageUrl);
                const imgRecord = await recordRepo.create({
                    device_id: deviceId,
                    user_id: userId ?? undefined,
                    status: "completed",
                    source: "manual",
                    source_type: "material",
                    file_url: imageUrl,
                    file_name: imgFileName,
                });
                await transcriptRepo.create({
                    record_id: imgRecord.id,
                    text: visionResult.text,
                });
                await summaryRepo.create({
                    record_id: imgRecord.id,
                    title: visionResult.success ? visionResult.text.slice(0, 50) : "[图片分析失败]",
                    short_summary: visionResult.text,
                });
                digestRecords([imgRecord.id], { deviceId, userId: userId ?? undefined }).catch((err) => console.error("[ingest] digest failed for record", imgRecord.id, ":", err));
                sendJson(res, {
                    recordId: imgRecord.id,
                    status: "processing",
                    description: visionResult.text,
                    visionSuccess: visionResult.success,
                }, 201);
                break;
            }
            case "file": {
                if (!body.file_base64 || !body.filename || !body.mimeType) {
                    sendJson(res, { error: "file_base64, filename, and mimeType are required for type=file" }, 400);
                    return;
                }
                if (!isValidBase64(body.file_base64)) {
                    sendJson(res, { error: "file_base64 is invalid or exceeds size limit (50MB)" }, 400);
                    return;
                }
                // Sanitize filename: strip path components
                const safeFilename = body.filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
                const fileBuf = Buffer.from(body.file_base64, "base64");
                const parseResult = await parseFile(fileBuf, safeFilename, body.mimeType);
                if (!parseResult.success) {
                    console.warn("[ingest] file parse failed:", parseResult.error);
                }
                // Upload to OSS if configured
                let fileOssUrl = null;
                if (isOssConfigured()) {
                    try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                        const ossName = `${deviceId}-${timestamp}-${safeFilename}`;
                        fileOssUrl = await uploadFile("files", ossName, fileBuf);
                    }
                    catch (err) {
                        console.error("[ingest] OSS file upload failed:", err);
                    }
                }
                const fileRecord = await recordRepo.create({
                    device_id: deviceId,
                    user_id: userId ?? undefined,
                    status: "completed",
                    source: "manual",
                    source_type: "material",
                    file_url: fileOssUrl ?? undefined,
                    file_name: safeFilename,
                });
                await transcriptRepo.create({
                    record_id: fileRecord.id,
                    text: parseResult.content,
                });
                await summaryRepo.create({
                    record_id: fileRecord.id,
                    title: safeFilename,
                    short_summary: parseResult.content.slice(0, 200),
                });
                if (parseResult.success) {
                    digestRecords([fileRecord.id], { deviceId, userId: userId ?? undefined }).catch((err) => console.error("[ingest] digest failed for record", fileRecord.id, ":", err));
                }
                sendJson(res, {
                    recordId: fileRecord.id,
                    status: parseResult.success ? "processing" : "parse_failed",
                    filename: safeFilename,
                    preview: parseResult.content.slice(0, 200),
                    parseSuccess: parseResult.success,
                }, 201);
                break;
            }
            case "url": {
                if (!body.content) {
                    sendJson(res, { error: "content (URL) is required for type=url" }, 400);
                    return;
                }
                if (!isValidUrl(body.content)) {
                    sendJson(res, { error: "Invalid URL. Only http/https URLs are accepted." }, 400);
                    return;
                }
                const { title, content: extracted, image } = await extractUrl(body.content);
                const urlRecord = await recordRepo.create({
                    device_id: deviceId,
                    user_id: userId ?? undefined,
                    status: "completed",
                    source: "url",
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
                digestRecords([urlRecord.id], { deviceId, userId: userId ?? undefined }).catch((err) => console.error("[ingest] digest failed for record", urlRecord.id, ":", err));
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
//# sourceMappingURL=ingest.js.map