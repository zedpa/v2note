/**
 * Base API client for Gateway REST API.
 * Replaces direct Supabase client calls.
 */

import { getGatewayHttpUrl } from "./gateway-url";

let _deviceId: string | null = null;

export function setApiDeviceId(id: string) {
  _deviceId = id;
}

export function getApiDeviceId(): string | null {
  return _deviceId;
}

/** Get auth module lazily to avoid circular imports */
async function getAuth() {
  return import("./auth");
}

async function request<T>(
  method: string,
  path: string,
  body?: any,
  _isRetry = false,
): Promise<T> {
  const base = getGatewayHttpUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_deviceId) {
    headers["X-Device-Id"] = _deviceId;
  }

  // Add Authorization header if logged in
  const auth = await getAuth();
  const token = auth.getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401: try refresh once
  if (res.status === 401 && !_isRetry && !path.includes("/auth/")) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(method, path, body, true);
    }
    // Refresh failed — clear auth and throw
    await auth.logout();
    throw new Error("登录已过期，请重新登录");
  }

  // Check content-type to guard against HTML responses
  // (e.g. Capacitor WebView intercepting localhost requests)
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error(
        `无法连接 Gateway（${base}），请在设置中配置正确的服务器地址`,
      );
    }
    // Some endpoints may return no content (204)
    if (res.status === 204 || text.length === 0) {
      return undefined as T;
    }
    // Try parsing as JSON anyway (some servers omit content-type)
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`API 返回了非 JSON 数据 (${res.status})`);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }

  return res.json();
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const auth = await getAuth();
    const rt = auth.getRefreshTokenValue();
    if (!rt) return false;
    const { refreshToken } = await import("./api/auth");
    const result = await refreshToken(rt);
    await auth.updateTokens(result.accessToken, result.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T>(path: string, body?: any) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: any) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: any) => request<T>("DELETE", path, body),
};
