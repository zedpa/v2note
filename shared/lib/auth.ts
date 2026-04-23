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
/**
 * §7.7 B1：initAuth() 从 storage 重建 _user 成功后只派发一次 `restored` 事件。
 * 热模块重载 / 测试场景下的重复 initAuth 不再派发。
 * saveAuthTokens / logout 路径会自行重置该标记以保证后续状态切换仍可派发。
 */
let _initialDispatched = false;

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

/**
 * §7.4: auth:user-changed 事件 —— 用户身份真实变化（登录/登出）的唯一信号源。
 * 严格限定：token silent refresh **不**派发该事件。
 * 订阅方（如 sync-orchestrator）依据此事件触发懒绑定扫描。
 */
/**
 * §7.7：login 事件补充 `reason` 字段用于展示层去抖，订阅方对两者行为一致。
 *   - "fresh"：来自用户交互的真实登录（saveAuthTokens）；订阅方可选触发欢迎 UI
 *   - "restored"：来自页面刷新 initAuth 的静默恢复；订阅方必须仍执行懒绑定扫描但不触发欢迎 UI
 *   - undefined（向后兼容）：旧事件视同 "fresh"
 */
export type AuthUserChangedDetail =
  | { kind: "login"; userId: string; reason?: "fresh" | "restored" }
  | { kind: "logout"; userId: null };

function dispatchUserChanged(detail: AuthUserChangedDetail): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<AuthUserChangedDetail>("auth:user-changed", { detail }),
    );
  } catch {
    // 事件派发失败不应阻塞登录/登出主流程
  }
}

/** Initialize auth state from storage (call once at startup) */
export async function initAuth(): Promise<void> {
  if (_initialized) return;
  _accessToken = await getItem(KEY_ACCESS_TOKEN);
  _refreshToken = await getItem(KEY_REFRESH_TOKEN);
  const userJson = await getItem(KEY_USER);
  let restoredUser: AppUser | null = null;
  if (userJson) {
    try {
      const parsed = JSON.parse(userJson) as AppUser | null;
      // 基础结构校验：必须是对象 + 具备非空 id 字段；否则视为损坏（B2）
      if (parsed && typeof parsed === "object" && typeof (parsed as AppUser).id === "string" && (parsed as AppUser).id.length > 0) {
        _user = parsed;
        restoredUser = parsed;
      } else {
        _user = null;
        // §7.7 B2：user 字段损坏（JSON.parse 过了但结构不对）→ 清掉坏数据，保留 accessToken
        await removeItem(KEY_USER);
      }
    } catch {
      _user = null;
      // §7.7 B2：JSON.parse 失败同样清理 voicenote:user，保留 accessToken 让下次 refresh 有机会重建
      await removeItem(KEY_USER);
    }
  }
  _initialized = true;
  // §7.7：成功从 storage 重建 user → 派发 `restored` 事件驱动懒绑定扫描。
  //        B1：只在第一次派发（_initialDispatched 标记）；
  //        B2：user 损坏 / 无 user → 不派发。
  //        P0-1 修复：通过 microtask 延后派发，让兄弟组件 useEffect（chat/timeline）
  //        先完成监听器注册。React 18 mount 顺序为子→父，但导航/StrictMode 下不稳定；
  //        microtask 延后能覆盖所有同 tick 内注册的订阅者。
  if (restoredUser && !_initialDispatched) {
    _initialDispatched = true;
    const userId = restoredUser.id;
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() =>
        dispatchUserChanged({ kind: "login", userId, reason: "restored" }),
      );
    } else {
      dispatchUserChanged({ kind: "login", userId, reason: "restored" });
    }
  }
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
  user: { id: string; phone: string | null; email?: string | null; displayName: string | null; createdAt?: string };
}): Promise<void> {
  const prevUserId = _user?.id ?? null;
  _accessToken = tokens.accessToken;
  _refreshToken = tokens.refreshToken;
  _user = {
    id: tokens.user.id,
    phone: tokens.user.phone,
    email: tokens.user.email ?? null,
    displayName: tokens.user.displayName,
    avatarUrl: null,
    createdAt: tokens.user.createdAt ?? new Date().toISOString(),
  };
  await setItem(KEY_ACCESS_TOKEN, _accessToken);
  await setItem(KEY_REFRESH_TOKEN, _refreshToken);
  await setItem(KEY_USER, JSON.stringify(_user));
  _initialized = true;
  // §7.4: 身份真实变化（null→userId 或 userA→userB）才派发 login 事件；
  //       同一 userId 重复保存（例如登录接口被重试）不派发，避免重复触发 sync 扫描（B5）
  if (prevUserId !== _user.id) {
    // §7.7：真实登录触发时标记 initial 已派发，避免后续 initAuth 再重复派发 restored
    _initialDispatched = true;
    dispatchUserChanged({ kind: "login", userId: _user.id, reason: "fresh" });
  }
}

/**
 * §7.4: silent refresh 专用 —— 不派发 auth:user-changed。
 * 仅刷新 token，不改 user；若未来此路径意外改动了用户身份应该走 saveAuthTokens。
 */
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
  // §7.7 P0-2：logout 重置 _initialDispatched 与 _initialized 对称，
  //          让后续 initAuth（罕见但理论可能）可再次正确工作。
  _initialDispatched = false;
  // 只在确实从登录态变为未登录时广播
  if (wasLoggedIn) {
    emitAuthEvent("auth:logout", reason);
    // §7.4: 同时派发身份变化事件，驱动 sync-orchestrator / UI 视图隔离等订阅方
    dispatchUserChanged({ kind: "logout", userId: null });
  }
}
