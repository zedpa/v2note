import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getDeviceId } from "../lib/http-helpers.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, signEmailVerificationToken, verifyEmailVerificationToken } from "../auth/jwt.js";
import { getAuthContext } from "../auth/middleware.js";
import { linkDeviceToUser } from "../auth/link-device.js";
import * as appUserRepo from "../db/repositories/app-user.js";
import * as refreshTokenRepo from "../db/repositories/refresh-token.js";
import * as emailVerificationRepo from "../db/repositories/email-verification.js";
import { sendVerificationEmail, generateCode } from "../auth/email.js";
import { deviceRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAuthRoutes(router: Router) {
  /**
   * POST /api/v1/auth/register
   * Body: { phone, password, displayName?, deviceId }
   *   or: { email, verificationToken, password, displayName?, deviceId }
   */
  router.post("/api/v1/auth/register", async (req, res) => {
    const body = await readBody<{
      phone?: string;
      email?: string;
      verificationToken?: string;
      password: string;
      displayName?: string;
      deviceId?: string; // deprecated, optional for backward compat
    }>(req);

    if (!body.password) {
      sendError(res, "password is required", 400);
      return;
    }

    if (body.password.length < 6) {
      sendError(res, "Password must be at least 6 characters", 400);
      return;
    }

    const passwordHash = await hashPassword(body.password);
    let user: appUserRepo.AppUser;

    if (body.email) {
      // 邮箱注册
      if (!body.verificationToken) {
        sendError(res, "verificationToken is required for email registration", 400);
        return;
      }

      let payload: { email: string; purpose: string };
      try {
        payload = verifyEmailVerificationToken(body.verificationToken);
      } catch {
        sendError(res, "验证 token 无效或已过期", 401);
        return;
      }

      if (payload.purpose !== "register" || payload.email !== body.email.toLowerCase()) {
        sendError(res, "验证 token 与邮箱不匹配", 400);
        return;
      }

      const existing = await appUserRepo.findByEmail(body.email);
      if (existing) {
        sendError(res, "该邮箱已注册", 409);
        return;
      }

      user = await appUserRepo.createWithEmail({
        email: body.email,
        password_hash: passwordHash,
        display_name: body.displayName,
      });
    } else if (body.phone) {
      // 手机号注册（原有逻辑）
      const existing = await appUserRepo.findByPhone(body.phone);
      if (existing) {
        sendError(res, "该手机号已注册", 409);
        return;
      }

      user = await appUserRepo.create({
        phone: body.phone,
        password_hash: passwordHash,
        display_name: body.displayName,
      });
    } else {
      sendError(res, "phone or email is required", 400);
      return;
    }

    // Link device + backfill data (optional, for backward compat)
    if (body.deviceId) {
      await linkDeviceToUser(body.deviceId, user.id);
    }

    // Issue tokens
    const tokens = await issueTokens(user.id, body.deviceId);

    sendJson(res, {
      user: { id: user.id, phone: user.phone, email: user.email, displayName: user.display_name },
      ...tokens,
    }, 201);
  });

  /**
   * POST /api/v1/auth/login
   * Body: { phone, password } or { email, password }
   */
  router.post("/api/v1/auth/login", async (req, res) => {
    const body = await readBody<{
      phone?: string;
      email?: string;
      password: string;
      deviceId?: string; // deprecated, optional for backward compat
    }>(req);

    if ((!body.phone && !body.email) || !body.password) {
      sendError(res, "phone or email, and password are required", 400);
      return;
    }

    let user: appUserRepo.AppUser | null;

    if (body.email) {
      user = await appUserRepo.findByEmail(body.email);
    } else {
      user = await appUserRepo.findByPhone(body.phone!);
    }

    if (!user) {
      sendError(res, body.email ? "邮箱或密码错误" : "手机号或密码错误", 401);
      return;
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      sendError(res, body.email ? "邮箱或密码错误" : "手机号或密码错误", 401);
      return;
    }

    // Link device + backfill data (optional, for backward compat)
    if (body.deviceId) {
      await linkDeviceToUser(body.deviceId, user.id);
    }

    // Issue tokens
    const tokens = await issueTokens(user.id, body.deviceId);

    sendJson(res, {
      user: { id: user.id, phone: user.phone, email: user.email, displayName: user.display_name },
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

    const deviceId = stored.device_id ?? undefined;
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
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      },
      devices,
    });
  });

  // ── 邮箱验证码 ──

  /**
   * POST /api/v1/auth/send-email-code
   * Body: { email, purpose: "register" | "bind" | "reset_password" }
   */
  router.post("/api/v1/auth/send-email-code", async (req, res) => {
    const body = await readBody<{ email: string; purpose: string }>(req);

    if (!body.email || !body.purpose) {
      sendError(res, "email and purpose are required", 400);
      return;
    }

    if (!EMAIL_REGEX.test(body.email)) {
      sendError(res, "邮箱格式无效", 400);
      return;
    }

    const validPurposes = ["register", "bind", "reset_password"];
    if (!validPurposes.includes(body.purpose)) {
      sendError(res, "Invalid purpose", 400);
      return;
    }

    const email = body.email.toLowerCase();

    // purpose=register 时检查邮箱是否已注册
    if (body.purpose === "register") {
      const existing = await appUserRepo.findByEmail(email);
      if (existing) {
        sendError(res, "该邮箱已注册", 409);
        return;
      }
    }

    // 60 秒内不能重复发送
    const recent = await emailVerificationRepo.findRecentByEmail(email);
    if (recent) {
      const waitSeconds = 60 - Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 1000);
      sendError(res, `请 ${waitSeconds} 秒后再试`, 429);
      return;
    }

    // 生成验证码并存入数据库
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await emailVerificationRepo.create({ email, code, purpose: body.purpose, expires_at: expiresAt });

    // 发送邮件（reset_password 时不泄漏用户是否存在，但仍发邮件）
    if (body.purpose === "reset_password") {
      const user = await appUserRepo.findByEmail(email);
      if (user) {
        await sendVerificationEmail(email, code);
      }
      // 不存在也返回 200，不泄漏
    } else {
      await sendVerificationEmail(email, code);
    }

    sendJson(res, { ok: true, expiresIn: 300 });
  });

  /**
   * POST /api/v1/auth/verify-email-code
   * Body: { email, code, purpose }
   */
  router.post("/api/v1/auth/verify-email-code", async (req, res) => {
    const body = await readBody<{ email: string; code: string; purpose: string }>(req);

    if (!body.email || !body.code || !body.purpose) {
      sendError(res, "email, code, and purpose are required", 400);
      return;
    }

    const email = body.email.toLowerCase();
    const record = await emailVerificationRepo.findLatestUnused(email, body.purpose);

    if (!record) {
      sendError(res, "验证码已过期或不存在", 410);
      return;
    }

    if (record.code !== body.code) {
      // 验证码错误
      if (record.attempts >= 2) {
        // 第 3 次失败，作废
        await emailVerificationRepo.markUsed(record.id);
        sendError(res, "验证码已失效，请重新获取", 429);
        return;
      }

      await emailVerificationRepo.incrementAttempts(record.id);
      const remaining = 2 - record.attempts;
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "验证码错误", remainingAttempts: remaining }));
      return;
    }

    // 验证成功
    await emailVerificationRepo.markUsed(record.id);
    const verificationToken = signEmailVerificationToken({
      email,
      purpose: body.purpose as "register" | "bind" | "reset_password",
    });

    sendJson(res, { ok: true, verificationToken });
  });

  // ── 忘记密码 ──

  /**
   * POST /api/v1/auth/reset-password
   * Body: { email, verificationToken, newPassword }
   */
  router.post("/api/v1/auth/reset-password", async (req, res) => {
    const body = await readBody<{
      email: string;
      verificationToken: string;
      newPassword: string;
    }>(req);

    if (!body.email || !body.verificationToken || !body.newPassword) {
      sendError(res, "email, verificationToken, and newPassword are required", 400);
      return;
    }

    let payload: { email: string; purpose: string };
    try {
      payload = verifyEmailVerificationToken(body.verificationToken);
    } catch {
      sendError(res, "验证 token 无效或已过期", 401);
      return;
    }

    if (payload.purpose !== "reset_password" || payload.email !== body.email.toLowerCase()) {
      sendError(res, "验证 token 不匹配", 400);
      return;
    }

    if (body.newPassword.length < 6) {
      sendError(res, "密码至少 6 位", 400);
      return;
    }

    const user = await appUserRepo.findByEmail(body.email);
    if (!user) {
      sendError(res, "用户不存在", 404);
      return;
    }

    const passwordHash = await hashPassword(body.newPassword);
    await appUserRepo.updatePassword(user.id, passwordHash);

    // 踢出所有设备
    await refreshTokenRepo.deleteByUser(user.id);

    sendJson(res, { ok: true });
  });

  // ── 绑定邮箱 ──

  /**
   * POST /api/v1/auth/bind-email
   * Body: { email, verificationToken }
   * Requires Authorization header
   */
  router.post("/api/v1/auth/bind-email", async (req, res) => {
    const auth = getAuthContext(req);
    const body = await readBody<{ email: string; verificationToken: string }>(req);

    if (!body.email || !body.verificationToken) {
      sendError(res, "email and verificationToken are required", 400);
      return;
    }

    let payload: { email: string; purpose: string };
    try {
      payload = verifyEmailVerificationToken(body.verificationToken);
    } catch {
      sendError(res, "验证 token 无效或已过期", 401);
      return;
    }

    if (payload.purpose !== "bind" || payload.email !== body.email.toLowerCase()) {
      sendError(res, "验证 token 不匹配", 400);
      return;
    }

    // 检查邮箱是否已被其他用户使用
    const existing = await appUserRepo.findByEmail(body.email);
    if (existing && existing.id !== auth.userId) {
      sendError(res, "该邮箱已被其他账户使用", 409);
      return;
    }

    const user = await appUserRepo.updateEmail(auth.userId, body.email);
    sendJson(res, {
      ok: true,
      user: { id: user.id, phone: user.phone, email: user.email, displayName: user.display_name, avatarUrl: user.avatar_url },
    });
  });

  // ── 个人资料 ──

  /**
   * PATCH /api/v1/auth/profile
   * Body: { displayName?, avatarUrl? }
   * Requires Authorization header
   */
  router.patch("/api/v1/auth/profile", async (req, res) => {
    const auth = getAuthContext(req);
    const body = await readBody<{ displayName?: string; avatarUrl?: string }>(req);

    if (body.displayName !== undefined) {
      const name = body.displayName.trim();
      if (name.length === 0 || name.length > 20) {
        sendError(res, "昵称长度 1-20 字符", 400);
        return;
      }
      body.displayName = name;
    }

    const user = await appUserRepo.updateProfile(auth.userId, {
      display_name: body.displayName,
      avatar_url: body.avatarUrl,
    });

    sendJson(res, {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      },
    });
  });
}

/** Issue access + refresh token pair */
async function issueTokens(userId: string, deviceId?: string) {
  const accessToken = signAccessToken({ userId });

  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId, tokenId });
  const tokenHash = refreshTokenRepo.hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await refreshTokenRepo.create({
    user_id: userId,
    token_hash: tokenHash,
    device_id: deviceId ?? undefined,
    expires_at: expiresAt,
  });

  return { accessToken, refreshToken };
}
