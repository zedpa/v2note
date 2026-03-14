/**
 * Client-side authentication state management.
 * Stores tokens in cross-platform storage (Capacitor Preferences / localStorage).
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

export async function logout(): Promise<void> {
  _accessToken = null;
  _refreshToken = null;
  _user = null;
  await removeItem(KEY_ACCESS_TOKEN);
  await removeItem(KEY_REFRESH_TOKEN);
  await removeItem(KEY_USER);
}
