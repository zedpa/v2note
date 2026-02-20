/**
 * Base API client for Gateway REST API.
 * Replaces direct Supabase client calls.
 */

const GATEWAY_WS_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://localhost:3001";

// Convert ws:// → http://, wss:// → https://
export const BASE_URL = GATEWAY_WS_URL
  .replace(/^ws:/, "http:")
  .replace(/^wss:/, "https:");

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_deviceId) {
    headers["X-Device-Id"] = _deviceId;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
