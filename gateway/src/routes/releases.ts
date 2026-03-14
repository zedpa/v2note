import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Router } from "../router.js";
import { sendJson, sendError, readBody } from "../lib/http-helpers.js";
import { appReleaseRepo } from "../db/repositories/index.js";
import { verifyAccessToken } from "../auth/jwt.js";
import type { IncomingMessage } from "node:http";

const BUNDLES_DIR = join(import.meta.dirname, "../../uploads/bundles");

// Ensure bundles directory exists
mkdirSync(BUNDLES_DIR, { recursive: true });

/** Simple admin check: JWT userId must match ADMIN_USER_ID env var */
function requireAdmin(req: IncomingMessage): string {
  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId) throw Object.assign(new Error("ADMIN_USER_ID not configured"), { status: 503 });

  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const payload = verifyAccessToken(authHeader.slice(7));
  if (payload.userId !== adminId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return payload.userId;
}

export function registerReleaseRoutes(router: Router) {
  // ── Public: Check for updates ──
  router.get("/api/v1/releases/check", async (req, res, _params, query) => {
    const platform = query.platform ?? "android";
    const currentVersionCode = parseInt(query.currentVersionCode ?? "0", 10);
    const nativeVersion = query.nativeVersion;

    // Check both APK and OTA updates
    const [apk, ota] = await Promise.all([
      appReleaseRepo.findLatest(platform, "apk", currentVersionCode),
      appReleaseRepo.findLatest(platform, "ota", currentVersionCode, nativeVersion),
    ]);

    sendJson(res, { apk: apk ?? null, ota: ota ?? null });
  });

  // ── Public: Download OTA bundle ──
  router.get("/api/v1/releases/bundles/:filename", async (req, res, params) => {
    const filePath = join(BUNDLES_DIR, params.filename);

    // Prevent path traversal
    if (!filePath.startsWith(BUNDLES_DIR) || params.filename.includes("..")) {
      sendError(res, "Invalid filename", 400);
      return;
    }

    if (!existsSync(filePath)) {
      sendError(res, "Bundle not found", 404);
      return;
    }

    const stat = statSync(filePath);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${params.filename}"`,
    });
    createReadStream(filePath).pipe(res);
  });

  // ── Admin: Create release record ──
  router.post("/api/v1/releases", async (req, res) => {
    const userId = requireAdmin(req);
    const body = await readBody<{
      version: string;
      version_code: number;
      platform?: string;
      release_type: string;
      bundle_url?: string;
      changelog?: string;
      is_mandatory?: boolean;
      min_native_version?: string;
    }>(req);

    if (!body.version || !body.version_code || !body.release_type) {
      sendError(res, "version, version_code, and release_type are required", 400);
      return;
    }

    const release = await appReleaseRepo.create({
      ...body,
      published_by: userId,
    });
    sendJson(res, release, 201);
  });

  // ── Admin: Upload bundle zip ──
  router.post("/api/v1/releases/:id/upload", async (req, res, params) => {
    requireAdmin(req);

    const release = await appReleaseRepo.findById(params.id);
    if (!release) {
      sendError(res, "Release not found", 404);
      return;
    }

    // Read raw binary body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      sendError(res, "Empty upload body", 400);
      return;
    }

    const filename = `bundle-v${release.version}.zip`;
    const filePath = join(BUNDLES_DIR, filename);
    await writeFile(filePath, buffer);

    // Calculate SHA256
    const hash = createHash("sha256").update(buffer).digest("hex");

    const updated = await appReleaseRepo.update(release.id, {
      bundle_url: `/api/v1/releases/bundles/${filename}`,
      file_size: buffer.length,
      checksum: hash,
    });

    sendJson(res, updated);
  });

  // ── Admin: Update release ──
  router.patch("/api/v1/releases/:id", async (req, res, params) => {
    requireAdmin(req);
    const body = await readBody<{
      bundle_url?: string;
      changelog?: string;
      is_mandatory?: boolean;
      is_active?: boolean;
      min_native_version?: string;
    }>(req);

    const updated = await appReleaseRepo.update(params.id, body);
    if (!updated) {
      sendError(res, "Release not found", 404);
      return;
    }
    sendJson(res, updated);
  });

  // ── Admin: List all releases ──
  router.get("/api/v1/releases", async (req, res, _params, query) => {
    requireAdmin(req);
    const releases = await appReleaseRepo.listAll(query.platform);
    sendJson(res, releases);
  });
}
