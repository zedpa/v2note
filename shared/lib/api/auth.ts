import { api } from "../api";

interface AuthResponse {
  user: { id: string; phone: string | null; email: string | null; displayName: string | null };
  accessToken: string;
  refreshToken: string;
}

// ── 手机号注册/登录（原有） ──

export async function registerUser(
  phone: string,
  password: string,
  deviceId: string,
  displayName?: string,
): Promise<AuthResponse> {
  return api.post("/api/v1/auth/register", {
    phone,
    password,
    deviceId,
    displayName,
  });
}

export async function loginUser(
  phone: string,
  password: string,
  deviceId: string,
): Promise<AuthResponse> {
  return api.post("/api/v1/auth/login", {
    phone,
    password,
    deviceId,
  });
}

// ── 邮箱注册/登录 ──

export async function registerWithEmail(
  email: string,
  verificationToken: string,
  password: string,
  deviceId: string,
  displayName?: string,
): Promise<AuthResponse> {
  return api.post("/api/v1/auth/register", {
    email,
    verificationToken,
    password,
    deviceId,
    displayName,
  });
}

export async function loginWithEmail(
  email: string,
  password: string,
  deviceId: string,
): Promise<AuthResponse> {
  return api.post("/api/v1/auth/login", {
    email,
    password,
    deviceId,
  });
}

// ── 邮箱验证码 ──

export async function sendEmailCode(
  email: string,
  purpose: "register" | "bind" | "reset_password",
): Promise<{ ok: boolean; expiresIn: number }> {
  return api.post("/api/v1/auth/send-email-code", { email, purpose });
}

export async function verifyEmailCode(
  email: string,
  code: string,
  purpose: "register" | "bind" | "reset_password",
): Promise<{ ok: boolean; verificationToken: string }> {
  return api.post("/api/v1/auth/verify-email-code", { email, code, purpose });
}

// ── 忘记密码 ──

export async function resetPassword(
  email: string,
  verificationToken: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return api.post("/api/v1/auth/reset-password", { email, verificationToken, newPassword });
}

// ── 绑定邮箱 ──

export async function bindEmail(
  email: string,
  verificationToken: string,
): Promise<{ ok: boolean; user: AuthResponse["user"] }> {
  return api.post("/api/v1/auth/bind-email", { email, verificationToken });
}

// ── 个人资料 ──

export async function updateProfile(
  fields: { displayName?: string; avatarUrl?: string },
): Promise<{ user: AuthResponse["user"] & { avatarUrl: string | null; createdAt: string } }> {
  return api.patch("/api/v1/auth/profile", fields);
}

// ── Token ──

export async function refreshToken(token: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  return api.post("/api/v1/auth/refresh", { refreshToken: token });
}

export async function logoutUser(refreshToken: string): Promise<{ ok: boolean }> {
  return api.post("/api/v1/auth/logout", { refreshToken });
}

export async function getMe(): Promise<{
  user: { id: string; phone: string | null; email: string | null; displayName: string | null; avatarUrl: string | null; createdAt: string };
  devices: Array<{ id: string; device_identifier: string; platform: string }>;
}> {
  return api.get("/api/v1/auth/me");
}
