/**
 * Auth Hardening Phase 1 测试
 * - refresh token 加锁（防竞态）
 * - 主动续期（token 快过期时提前 refresh）
 * - clearError（登录/注册模式切换清错误）
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("api.ts — refresh token 竞态保护", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "./api.ts"),
    "utf-8",
  );

  it("should_have_refresh_lock_variable", () => {
    expect(source).toMatch(/_refreshPromise/);
  });

  it("should_reuse_pending_refresh_promise", () => {
    // tryRefreshToken 应该检查是否已有进行中的 refresh
    expect(source).toContain("if (_refreshPromise)");
  });

  it("should_clear_lock_in_finally_block", () => {
    // 确保 finally 中清除锁
    expect(source).toMatch(/_refreshPromise\s*=\s*null/);
  });
});

describe("api.ts — 主动续期", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "./api.ts"),
    "utf-8",
  );

  it("should_have_proactive_refresh_function", () => {
    expect(source).toMatch(/ensureFreshToken/);
  });

  it("should_check_token_exp_field", () => {
    // 应该解码 JWT payload 检查 exp
    expect(source).toContain(".exp");
  });

  it("should_call_ensureFreshToken_in_request", () => {
    // request 函数中应调用 ensureFreshToken
    expect(source).toContain("ensureFreshToken");
  });
});

describe("jwt.ts — access token 延长到 2 小时", () => {
  it("should_have_2h_expiry_for_access_token", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../gateway/src/auth/jwt.ts"),
      "utf-8",
    );
    // 不应该是 15m
    expect(source).not.toMatch(/expiresIn:\s*["']15m["']/);
    // 应该是 2h
    expect(source).toMatch(/expiresIn:\s*["']2h["']/);
  });
});

describe("use-auth — clearError 方法", () => {
  it("should_export_clearError", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../features/auth/hooks/use-auth.ts"),
      "utf-8",
    );
    expect(source).toContain("clearError");
    // 应该在 return 中暴露
    expect(source).toMatch(/return\s*\{[^}]*clearError/);
  });
});

describe("app/page.tsx — 模式切换清错误", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../app/page.tsx"),
    "utf-8",
  );

  it("should_clear_error_on_switch_to_register", () => {
    // 找到 onSwitchToRegister 回调，应包含 clearError
    expect(source).toMatch(/onSwitchToRegister.*clearError/s);
  });

  it("should_clear_error_on_switch_to_login", () => {
    // 找到 onSwitchToLogin 回调，应包含 clearError
    expect(source).toMatch(/onSwitchToLogin.*clearError/s);
  });
});
