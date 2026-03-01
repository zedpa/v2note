/**
 * Runtime-configurable Gateway URL.
 * Priority: localStorage override > env var > default.
 *
 * This allows the Android APK (which bakes env vars at build time)
 * to point to a real server without rebuilding.
 */

const STORAGE_KEY = "voicenote:gatewayUrl";
const ENV_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://localhost:3001";

/** Ensure URL has ws:// or wss:// prefix */
function normalizeWsUrl(url: string): string {
  const trimmed = url.trim();
  if (/^wss?:\/\//.test(trimmed)) return trimmed;
  // Bare host:port → add ws://
  return `ws://${trimmed}`;
}

/** Get the WebSocket gateway URL (ws:// or wss://) */
export function getGatewayWsUrl(): string {
  if (typeof window !== "undefined") {
    const override = localStorage.getItem(STORAGE_KEY);
    if (override) return normalizeWsUrl(override);
  }
  return normalizeWsUrl(ENV_URL);
}

/** Get the HTTP gateway URL (http:// or https://) */
export function getGatewayHttpUrl(): string {
  const ws = getGatewayWsUrl();
  return ws.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

/** Override the gateway URL at runtime (persisted in localStorage) */
export function setGatewayUrl(url: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, url);
  }
}

/** Clear the runtime override (revert to env var) */
export function clearGatewayUrl(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
