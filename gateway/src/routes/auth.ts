import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getDeviceId } from "../lib/http-helpers.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/jwt.js";
import { getAuthContext } from "../auth/middleware.js";
import { linkDeviceToUser } from "../auth/link-device.js";
import * as appUserRepo from "../db/repositories/app-user.js";
import * as refreshTokenRepo from "../db/repositories/refresh-token.js";
import { deviceRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";

export function registerAuthRoutes(router: Router) {
  /**
   * POST /api/v1/auth/register
   * Body: { phone, password, displayName?, deviceId }
   */
  router.post("/api/v1/auth/register", async (req, res) => {
    const body = await readBody<{
      phone: string;
      password: string;
      displayName?: string;
      deviceId: string;
    }>(req);

    if (!body.phone || !body.password || !body.deviceId) {
      sendError(res, "phone, password, and deviceId are required", 400);
      return;
    }

    if (body.password.length < 6) {
      sendError(res, "Password must be at least 6 characters", 400);
      return;
    }

    // Check phone uniqueness
    const existing = await appUserRepo.findByPhone(body.phone);
    if (existing) {
      sendError(res, "该手机号已注册", 409);
      return;
    }

    // Create user
    const passwordHash = await hashPassword(body.password);
    const user = await appUserRepo.create({
      phone: body.phone,
      password_hash: passwordHash,
      display_name: body.displayName,
    });

    // Link device + backfill data
    await linkDeviceToUser(body.deviceId, user.id);

    // Issue tokens
    const tokens = await issueTokens(user.id, body.deviceId);

    sendJson(res, {
      user: { id: user.id, phone: user.phone, displayName: user.display_name },
      ...tokens,
    }, 201);
  });

  /**
   * POST /api/v1/auth/login
   * Body: { phone, password, deviceId }
   */
  router.post("/api/v1/auth/login", async (req, res) => {
    const body = await readBody<{
      phone: string;
      password: string;
      deviceId: string;
    }>(req);

    if (!body.phone || !body.password || !body.deviceId) {
      sendError(res, "phone, password, and deviceId are required", 400);
      return;
    }

    const user = await appUserRepo.findByPhone(body.phone);
    if (!user) {
      sendError(res, "手机号或密码错误", 401);
      return;
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      sendError(res, "手机号或密码错误", 401);
      return;
    }

    // Link device + backfill data
    await linkDeviceToUser(body.deviceId, user.id);

    // Issue tokens
    const tokens = await issueTokens(user.id, body.deviceId);

    sendJson(res, {
      user: { id: user.id, phone: user.phone, displayName: user.display_name },
      ...tokens,
    });
  });

  /**
   * POST /api/v1/auth/refresh
   * Body: { refreshToken }
   */
  router.post("/api/v1/auth/refresh", async (req, res) => {
    const body = await readBody<{ refreshToken: string }>(req);
    if (!body.refreshToken) {
      sendError(res, "refreshToken is required", 400);
      return;
    }

    // Verify JWT structure
    let payload: { userId: string; tokenId: string };
    try {
      payload = verifyRefreshToken(body.refreshToken);
    } catch {
      sendError(res, "Invalid or expired refresh token", 401);
      return;
    }

    // Check token exists in DB
    const tokenHash = refreshTokenRepo.hashToken(body.refreshToken);
    const stored = await refreshTokenRepo.findByHash(tokenHash);
    if (!stored) {
      sendError(res, "Refresh token revoked or expired", 401);
      return;
    }

    // Rotate: delete old, issue new
    await refreshTokenRepo.deleteByHash(tokenHash);

    const deviceId = stored.device_id ?? getDeviceId(req); // 从 stored 或请求头取设备 ID
    const tokens = await issueTokens(payload.userId, deviceId);

    sendJson(res, tokens);
  });

  /**
   * POST /api/v1/auth/logout
   * Body: { refreshToken }
   */
  router.post("/api/v1/auth/logout", async (req, res) => {
    const body = await readBody<{ refreshToken?: string }>(req);
    if (body.refreshToken) {
      const tokenHash = refreshTokenRepo.hashToken(body.refreshToken);
      await refreshTokenRepo.deleteByHash(tokenHash);
    }
    sendJson(res, { ok: true });
  });

  /**
   * GET /api/v1/auth/me
   * Requires Authorization header
   */
  router.get("/api/v1/auth/me", async (req, res) => {
    const auth = getAuthContext(req);
    const user = await appUserRepo.findById(auth.userId);
    if (!user) {
      sendError(res, "User not found", 404);
      return;
    }

    // Get linked devices
    const devices = await query<{ id: string; device_identifier: string; platform: string }>(
      `SELECT id, device_identifier, platform FROM device WHERE user_id = $1`,
      [user.id],
    );

    sendJson(res, {
      user: {
        id: user.id,
        phone: user.phone,
        displayName: user.display_name,
        createdAt: user.created_at,
      },
      devices,
    });
  });
}

/** Issue access + refresh token pair */
async function issueTokens(userId: string, deviceId: string) {
  const accessToken = signAccessToken({ userId, deviceId });

  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId, tokenId });
  const tokenHash = refreshTokenRepo.hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await refreshTokenRepo.create({
    user_id: userId,
    token_hash: tokenHash,
    device_id: deviceId,
    expires_at: expiresAt,
  });

  return { accessToken, refreshToken };
}
