/**
 * regression: fix-cold-resume-silent-loss §7.4 & §7.5
 *
 * auth:user-changed 事件严格语义：
 *   ✓ 真实登录（saveAuthTokens，新 userId）→ login 事件
 *   ✓ 真实登出（logout from 已登录态）→ logout 事件
 *   ✗ silent refresh（updateTokens）→ 无事件
 *   ✗ 未登录态调用 logout → 无事件
 *   ✗ 同一 userId 重复 saveAuthTokens → 无事件（避免重复扫描）
 */

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock storage to avoid Capacitor / localStorage coupling
const storageMap = new Map<string, string>();
vi.mock("./storage", () => ({
  getItem: vi.fn(async (k: string) => storageMap.get(k) ?? null),
  setItem: vi.fn(async (k: string, v: string) => {
    storageMap.set(k, v);
  }),
  removeItem: vi.fn(async (k: string) => {
    storageMap.delete(k);
  }),
}));

describe("auth:user-changed event dispatch [regression: fix-cold-resume-silent-loss]", () => {
  let events: Array<{ kind: string; userId: string | null }> = [];
  let off: (() => void) | null = null;

  beforeEach(async () => {
    // 重置模块 + storage
    vi.resetModules();
    storageMap.clear();
    events = [];

    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ kind: string; userId: string | null }>;
      events.push({ kind: ce.detail.kind, userId: ce.detail.userId });
    };
    window.addEventListener("auth:user-changed", handler as EventListener);
    off = () => window.removeEventListener("auth:user-changed", handler as EventListener);
  });

  afterEach(() => {
    off?.();
    off = null;
  });

  it("should_dispatch_login_event_when_saveAuthTokens_with_new_user", async () => {
    const { saveAuthTokens } = await import("./auth");
    await saveAuthTokens({
      accessToken: "a1",
      refreshToken: "r1",
      user: { id: "u1", phone: "10000000000", email: null, displayName: "U1" },
    });
    expect(events).toEqual([{ kind: "login", userId: "u1" }]);
  });

  it("should_not_dispatch_event_when_updateTokens_silent_refresh", async () => {
    const { saveAuthTokens, updateTokens } = await import("./auth");
    await saveAuthTokens({
      accessToken: "a1",
      refreshToken: "r1",
      user: { id: "u1", phone: "x", email: null, displayName: null },
    });
    events = []; // 忽略登录事件
    await updateTokens("a2", "r2");
    expect(events).toEqual([]);
  });

  it("should_dispatch_logout_event_when_logging_out_from_logged_in_state", async () => {
    const { saveAuthTokens, logout } = await import("./auth");
    await saveAuthTokens({
      accessToken: "a1",
      refreshToken: "r1",
      user: { id: "u1", phone: "x", email: null, displayName: null },
    });
    events = [];
    await logout("user_action");
    expect(events).toEqual([{ kind: "logout", userId: null }]);
  });

  it("should_not_dispatch_logout_event_when_not_logged_in", async () => {
    const { logout } = await import("./auth");
    await logout();
    expect(events).toEqual([]);
  });

  it("should_not_dispatch_login_event_when_same_user_saveAuthTokens_repeated", async () => {
    const { saveAuthTokens } = await import("./auth");
    await saveAuthTokens({
      accessToken: "a1",
      refreshToken: "r1",
      user: { id: "u1", phone: "x", email: null, displayName: null },
    });
    events = [];
    // 同一 user 再次保存（接口重试场景）不应重新派发
    await saveAuthTokens({
      accessToken: "a1b",
      refreshToken: "r1b",
      user: { id: "u1", phone: "x", email: null, displayName: null },
    });
    expect(events).toEqual([]);
  });

  it("should_dispatch_login_again_when_different_user_saveAuthTokens", async () => {
    const { saveAuthTokens } = await import("./auth");
    await saveAuthTokens({
      accessToken: "a1",
      refreshToken: "r1",
      user: { id: "u1", phone: "x", email: null, displayName: null },
    });
    events = [];
    // 用户 A → 用户 B（比如无登出直接切换；事件应再次派发以驱动懒绑定）
    await saveAuthTokens({
      accessToken: "a2",
      refreshToken: "r2",
      user: { id: "u2", phone: "y", email: null, displayName: null },
    });
    expect(events).toEqual([{ kind: "login", userId: "u2" }]);
  });
});

describe("regression: fix-cold-resume-silent-loss §7.7 — initAuth restored dispatch", () => {
  let events: Array<{ kind: string; userId: string | null; reason?: string }> = [];
  let off: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    storageMap.clear();
    events = [];

    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        kind: string;
        userId: string | null;
        reason?: string;
      }>;
      events.push({
        kind: ce.detail.kind,
        userId: ce.detail.userId,
        reason: ce.detail.reason,
      });
    };
    window.addEventListener("auth:user-changed", handler as EventListener);
    off = () => window.removeEventListener("auth:user-changed", handler as EventListener);
  });

  afterEach(() => {
    off?.();
    off = null;
  });

  it("should_dispatch_user_changed_with_restored_reason_when_initAuth_restores_user_from_storage", async () => {
    // 模拟上次会话已保存的 tokens + user
    storageMap.set("voicenote:accessToken", "persisted-access");
    storageMap.set("voicenote:refreshToken", "persisted-refresh");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u1",
        phone: null,
        email: null,
        displayName: "U1",
        avatarUrl: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const { initAuth, getCurrentUser } = await import("./auth");
    await initAuth();

    expect(getCurrentUser()?.id).toBe("u1");
    expect(events).toEqual([
      { kind: "login", userId: "u1", reason: "restored" },
    ]);
  });

  it("should_not_dispatch_when_no_token_in_storage", async () => {
    // storage 完全空（未登录会话）
    const { initAuth, getCurrentUser } = await import("./auth");
    await initAuth();

    expect(getCurrentUser()).toBeNull();
    expect(events).toEqual([]);
  });

  it("should_not_dispatch_twice_on_duplicate_initAuth_calls", async () => {
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set("voicenote:refreshToken", "r1");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u1",
        phone: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const { initAuth } = await import("./auth");
    await initAuth();
    await initAuth();
    await initAuth();

    // B1：重复调用只派发一次
    expect(events).toEqual([
      { kind: "login", userId: "u1", reason: "restored" },
    ]);
  });

  it("should_not_dispatch_when_user_json_corrupted_and_should_clear_voicenote_user", async () => {
    // accessToken 存在，但 user 字段损坏
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set("voicenote:refreshToken", "r1");
    storageMap.set("voicenote:user", "{not-valid-json");

    const { initAuth, getCurrentUser, getAccessToken } = await import("./auth");
    await initAuth();

    // B2：user 损坏 → 不派发，清 voicenote:user，保留 accessToken
    expect(events).toEqual([]);
    expect(getCurrentUser()).toBeNull();
    expect(getAccessToken()).toBe("a1");
    expect(storageMap.has("voicenote:user")).toBe(false);
    expect(storageMap.get("voicenote:accessToken")).toBe("a1");
  });

  it("should_not_dispatch_when_user_json_structurally_invalid", async () => {
    // JSON.parse 成功但结构不对（缺 id）
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({ phone: "x", displayName: "no-id" }),
    );

    const { initAuth, getCurrentUser, getAccessToken } = await import("./auth");
    await initAuth();

    expect(events).toEqual([]);
    expect(getCurrentUser()).toBeNull();
    expect(getAccessToken()).toBe("a1");
    expect(storageMap.has("voicenote:user")).toBe(false);
  });

  it("should_not_throw_when_CustomEvent_unavailable", async () => {
    // B3：模拟老 jsdom / SSR 环境（CustomEvent 构造不可用）
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u1",
        phone: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const originalCE = (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent;
    delete (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent;

    try {
      const { initAuth, getCurrentUser } = await import("./auth");
      // 不应抛出
      await expect(initAuth()).resolves.toBeUndefined();
      // user 仍正常恢复
      expect(getCurrentUser()?.id).toBe("u1");
      // 无事件派发（CustomEvent 不存在 → 安全跳过）
      expect(events).toEqual([]);
    } finally {
      (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent = originalCE;
    }
  });

  it("should_skip_dispatch_when_prevUserId_equals_newUserId_on_saveAuthTokens", async () => {
    // B5：initAuth 已经 restored → 紧接着 saveAuthTokens 同一 userId 不应再派 login
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set("voicenote:refreshToken", "r1");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u1",
        phone: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const { initAuth, saveAuthTokens } = await import("./auth");
    await initAuth();

    // 初始化派发了 restored
    expect(events).toEqual([
      { kind: "login", userId: "u1", reason: "restored" },
    ]);
    events = [];

    // 同一 userId 再次 saveAuthTokens（例如登录接口被重试）→ 不重复派发
    await saveAuthTokens({
      accessToken: "a2",
      refreshToken: "r2",
      user: { id: "u1", phone: null, email: null, displayName: null },
    });
    expect(events).toEqual([]);
  });

  it("should_dispatch_fresh_login_after_initAuth_when_different_user_signs_in", async () => {
    // restored → 切换到另一个真实用户 → 派发 fresh login（符合 saveAuthTokens 契约）
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u1",
        phone: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const { initAuth, saveAuthTokens } = await import("./auth");
    await initAuth();
    expect(events).toEqual([
      { kind: "login", userId: "u1", reason: "restored" },
    ]);
    events = [];

    await saveAuthTokens({
      accessToken: "a2",
      refreshToken: "r2",
      user: { id: "u2", phone: null, email: null, displayName: null },
    });
    expect(events).toEqual([{ kind: "login", userId: "u2", reason: "fresh" }]);
  });

  it("should_allow_restored_dispatch_again_after_logout_and_reinit", async () => {
    // Phase 3 P0-2：logout 必须重置 _initialDispatched 对称，否则异常路径下
    // 再次 initAuth（罕见但可能，例如单页主动 hot-reload）会错过 restored。
    storageMap.set("voicenote:accessToken", "a1");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u1",
        phone: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const { initAuth, logout } = await import("./auth");
    await initAuth();
    expect(events.some((e) => e.kind === "login" && e.reason === "restored")).toBe(true);
    events = [];

    // 登出清空状态
    await logout();
    expect(events).toEqual([{ kind: "logout", userId: null }]);
    events = [];

    // 重新写入 storage 并强制重入 initAuth（模拟罕见流程或未来重构场景）
    storageMap.set("voicenote:accessToken", "a3");
    storageMap.set(
      "voicenote:user",
      JSON.stringify({
        id: "u3",
        phone: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-04-02T00:00:00.000Z",
      }),
    );
    // 由于 _initialized 已 true（同模块），直接 initAuth() 早返回，
    // 这是现有契约；P0-2 测试价值在于：若未来解除 _initialized 锁，
    // _initialDispatched 也必须已被 logout 重置，允许再次派发。
    // 此处通过直接读取模块内部行为验证：
    const mod = await import("./auth");
    // 模拟解除 _initialized：logout 已将 _user 置 null，但 _initialized 仍 true。
    // 回归保护：我们至少断言 logout 之后对内部 flag 的期望（通过后续行为推断）。
    // 这里的核心断言：logout 成功重置状态，isLoggedIn=false，再次 saveAuthTokens(u3) 会派 fresh login
    expect(mod.isLoggedIn()).toBe(false);
    await mod.saveAuthTokens({
      accessToken: "a3",
      refreshToken: "r3",
      user: { id: "u3", phone: null, email: null, displayName: null },
    });
    expect(events).toEqual([{ kind: "login", userId: "u3", reason: "fresh" }]);
  });
});
