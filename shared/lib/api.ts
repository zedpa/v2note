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

async function request<T>(
  method: string,
  path: string,
  body?: any,
): Promise<T> {
  const base = getGatewayHttpUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_deviceId) {
    headers["X-Device-Id"] = _deviceId;
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T>(path: string, body?: any) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: any) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: any) => request<T>("DELETE", path, body),
};
