import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";

export interface AccessTokenPayload {
  userId: string;
  deviceId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "2h" });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, SECRET) as RefreshTokenPayload;
}

// ── Email Verification Token ──

export interface EmailVerificationPayload {
  email: string;
  purpose: "register" | "bind" | "reset_password";
}

/** 签发邮箱验证 token（验证码通过后，用于后续操作，10 分钟有效） */
export function signEmailVerificationToken(payload: EmailVerificationPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "10m" });
}

/** 验证邮箱验证 token */
export function verifyEmailVerificationToken(token: string): EmailVerificationPayload {
  return jwt.verify(token, SECRET) as EmailVerificationPayload;
}
