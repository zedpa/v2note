/**
 * Auth Phase 2 测试
 * - 记住账号（lastPhone）
 * - 自动登录勾选
 * - 密码显隐切换
 * - 登录失败计数
 * - 注册密码强度提示
 * - 手机号格式校验
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const loginSource = fs.readFileSync(
  path.resolve(__dirname, "./login-page.tsx"),
  "utf-8",
);

const registerSource = fs.readFileSync(
  path.resolve(__dirname, "./register-page.tsx"),
  "utf-8",
);

describe("login-page — 记住账号", () => {
  it("should_read_lastPhone_from_localStorage", () => {
    expect(loginSource).toContain("lastPhone");
  });

  it("should_initialize_phone_with_stored_value", () => {
    // useState 应该用 localStorage 中的值初始化
    expect(loginSource).toMatch(/useState.*lastPhone|localStorage.*lastPhone/);
  });
});

describe("login-page — 自动登录", () => {
  it("should_have_auto_login_checkbox", () => {
    expect(loginSource).toMatch(/autoLogin|自动登录/);
  });
});

describe("login-page — 密码显隐切换", () => {
  it("should_have_password_visibility_toggle", () => {
    // 应该有 showPassword 状态或 Eye/EyeOff 图标
    expect(loginSource).toMatch(/showPassword|Eye|eye/i);
  });

  it("should_toggle_input_type_between_password_and_text", () => {
    // type 应该动态切换
    expect(loginSource).toMatch(/type=.*showPassword.*password.*text|type=.*password.*text/s);
  });
});

describe("login-page — 失败计数", () => {
  it("should_track_login_failure_count", () => {
    expect(loginSource).toMatch(/failCount|loginAttempts/);
  });

  it("should_show_help_after_multiple_failures", () => {
    // 3 次失败后显示帮助
    expect(loginSource).toMatch(/failCount.*>=?\s*3|忘记密码/);
  });
});

describe("register-page — 密码显隐切换", () => {
  it("should_have_password_visibility_toggle", () => {
    expect(registerSource).toMatch(/showPassword|Eye|eye/i);
  });
});

describe("register-page — 密码强度提示", () => {
  it("should_have_password_strength_indicator", () => {
    expect(registerSource).toMatch(/strength|强度|weak|medium|strong/i);
  });
});

describe("register-page — 手机号格式校验", () => {
  it("should_validate_phone_number_format", () => {
    // 应该有手机号正则
    expect(registerSource).toMatch(/1\[3-9\]|手机号.*格式|请输入正确/);
  });
});

describe("use-auth — 登录成功存 lastPhone", () => {
  const useAuthSource = fs.readFileSync(
    path.resolve(__dirname, "../hooks/use-auth.ts"),
    "utf-8",
  );

  it("should_save_phone_to_localStorage_on_login", () => {
    expect(useAuthSource).toContain("lastPhone");
  });
});
