/**
 * auth-session spec 测试
 * 覆盖场景 1-5: 登出、网络失败、token 刷新、refresh 过期、确认弹窗
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 依赖
vi.mock("@/shared/lib/auth", () => ({
  initAuth: vi.fn().mockResolvedValue(undefined),
  isLoggedIn: vi.fn().mockReturnValue(true),
  getCurrentUser: vi.fn().mockReturnValue({ id: "u1", phone: "13800138000", displayName: "Test", createdAt: "2026-01-01" }),
  saveAuthTokens: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getRefreshTokenValue: vi.fn().mockReturnValue("rt_123"),
}));

vi.mock("@/shared/lib/api/auth", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  refreshToken: vi.fn(),
  logoutUser: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/shared/lib/device", () => ({
  getDeviceId: vi.fn().mockResolvedValue("dev_1"),
}));

vi.mock("@/shared/lib/api", () => ({
  setApiDeviceId: vi.fn(),
}));

import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./use-auth";
import { logout as doLogout, getRefreshTokenValue } from "@/shared/lib/auth";
import { logoutUser } from "@/shared/lib/api/auth";

describe("auth-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1: 正常登出 — 调后端 + 清本地
  it("should_call_backend_logout_and_clear_local_when_logout", async () => {
    const { result } = renderHook(() => useAuth());

    // 等待初始化
    await act(async () => {});

    await act(async () => {
      await result.current.logout();
    });

    // 应调用后端 logout API
    expect(logoutUser).toHaveBeenCalledWith("rt_123");
    // 应清除本地 token
    expect(doLogout).toHaveBeenCalled();
    // 状态应更新
    expect(result.current.loggedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 场景 2: 登出网络失败 — 仍清除本地
  it("should_clear_local_tokens_when_logout_network_fails", async () => {
    vi.mocked(logoutUser).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    await act(async () => {
      await result.current.logout();
    });

    // 即使后端失败，仍清除本地
    expect(doLogout).toHaveBeenCalled();
    expect(result.current.loggedIn).toBe(false);
  });

  // 场景 3 & 4 的测试在 shared/lib/api.test.ts 中（api 层 401 拦截）
});
