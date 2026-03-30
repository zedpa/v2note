/**
 * Client-side authentication state management.
 * Stores tokens in cross-platform storage (Capacitor Preferences / localStorage).
 *
 * 事件系统：当登录态发生变化时广播 "auth:logout" 事件，
 * 供 useAuth / gateway-client 等订阅方实时响应。
 */

import { getItem, setItem, removeItem } from "./storage";
import type { AppUser } from "./types";

const KEY_ACCESS_TOKEN = "voicenote:accessToken";
const KEY_REFRESH_TOKEN = "voicenote:refreshToken";
const KEY_USER = "voicenote:user";

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _user: AppUser | null = null;
let _initialized = false;

// ── 认证状态事件总线 ──────────────────────────────────────────────
type AuthEventType = "auth:logout";
type AuthListener = (reason?: string) => void;
const _listeners = new Map<AuthEventType, Set<AuthListener>>();

/** 订阅认证事件，返回取消函数 */
export function onAuthEvent(event: AuthEventType, fn: AuthListener): () => void {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event)!.add(fn);
  return () => { _listeners.get(event)?.delete(fn); };
}

function emitAuthEvent(event: AuthEventType, reason?: string) {
  _listeners.get(event)?.forEach((fn) => fn(reason));
}

/** Initialize auth state from storage (call once at startup) */
export async function initAuth(): Promise<void> {
  if (_initialized) return;
  _accessToken = await getItem(KEY_ACCESS_TOKEN);
  _refreshToken = await getItem(KEY_REFRESH_TOKEN);
  const userJson = await getItem(KEY_USER);
  if (userJson) {
    try {
      _user = JSON.parse(userJson);
    } catch {
      _user = null;
    }
  }
  _initialized = true;
}

export function isLoggedIn(): boolean {
  return !!_accessToken && !!_user;
}

export function getCurrentUser(): AppUser | null {
  return _user;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function getRefreshTokenValue(): string | null {
  return _refreshToken;
}

export async function saveAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; displayName: string | null; createdAt?: string };
}): Promise<void> {
  _accessToken = tokens.accessToken;
  _refreshToken = tokens.refreshToken;
  _user = {
    id: tokens.user.id,
    phone: tokens.user.phone,
    displayName: tokens.user.displayName,
    createdAt: tokens.user.createdAt ?? new Date().toISOString(),
  };
  await setItem(KEY_ACCESS_TOKEN, _accessToken);
  await setItem(KEY_REFRESH_TOKEN, _refreshToken);
  await setItem(KEY_USER, JSON.stringify(_user));
  _initialized = true;
}

export async function updateTokens(accessToken: string, refreshToken: string): Promise<void> {
  _accessToken = accessToken;
  _refreshToken = refreshToken;
  await setItem(KEY_ACCESS_TOKEN, accessToken);
  await setItem(KEY_REFRESH_TOKEN, refreshToken);
}

export async function logout(reason?: string): Promise<void> {
  const wasLoggedIn = !!_accessToken && !!_user;
  _accessToken = null;
  _refreshToken = null;
  _user = null;
  await removeItem(KEY_ACCESS_TOKEN);
  await removeItem(KEY_REFRESH_TOKEN);
  await removeItem(KEY_USER);
  // 只在确实从登录态变为未登录时广播
  if (wasLoggedIn) {
    emitAuthEvent("auth:logout", reason);
  }
}
