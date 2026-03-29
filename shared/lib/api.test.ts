/**
 * auth-session spec 场景 3 & 4: token 自动刷新 + refresh 失败跳登录
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
const mockGetAccessToken = vi.fn().mockReturnValue("valid_token");
const mockGetRefreshTokenValue = vi.fn().mockReturnValue("rt_123");
const mockUpdateTokens = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("./auth", () => ({
  getAccessToken: () => mockGetAccessToken(),
  getRefreshTokenValue: () => mockGetRefreshTokenValue(),
  updateTokens: (...args: any[]) => mockUpdateTokens(...args),
  logout: () => mockLogout(),
}));

const mockRefreshToken = vi.fn();
vi.mock("./api/auth", () => ({
  refreshToken: (...args: any[]) => mockRefreshToken(...args),
}));

vi.mock("./gateway-url", () => ({
  getGatewayHttpUrl: () => "http://localhost:3001",
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { api } from "./api";

describe("api token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 3: access token 过期 → 自动刷新 → 重试成功
  it("should_auto_refresh_and_retry_when_401", async () => {
    // 第一次请求返回 401
    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: "Unauthorized" }),
    });

    // refresh 成功
    mockRefreshToken.mockResolvedValueOnce({
      accessToken: "new_at",
      refreshToken: "new_rt",
    });

    // 重试请求成功
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: "success" }),
    });

    const result = await api.get("/api/v1/todos");
    expect(result).toEqual({ data: "success" });
    expect(mockRefreshToken).toHaveBeenCalledWith("rt_123");
    expect(mockUpdateTokens).toHaveBeenCalledWith("new_at", "new_rt");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // 场景 4: refresh token 也过期 → 清除 + 抛错
  it("should_logout_and_throw_when_refresh_fails", async () => {
    // 请求返回 401
    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: "Unauthorized" }),
    });

    // refresh 失败
    mockRefreshToken.mockRejectedValueOnce(new Error("Token expired"));

    await expect(api.get("/api/v1/todos")).rejects.toThrow("登录已过期，请重新登录");
    expect(mockLogout).toHaveBeenCalled();
  });

  // 边界: 不对 /auth/ 路径执行 refresh
  it("should_not_refresh_on_auth_endpoints", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: "Bad credentials" }),
    });

    await expect(api.post("/api/v1/auth/login", {})).rejects.toThrow();
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });
});
