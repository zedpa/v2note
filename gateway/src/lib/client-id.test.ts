/**
 * regression: fix-cold-resume-silent-loss
 * Phase 3 A2: client_id 输入校验
 */
import { describe, it, expect } from "vitest";
import { isValidClientId } from "./client-id.js";

describe("isValidClientId (A2 input validation)", () => {
  // regression: fix-cold-resume-silent-loss

  it("should_reject_empty_string", () => {
    expect(isValidClientId("")).toBe(false);
  });

  it("should_reject_whitespace_only_string", () => {
    expect(isValidClientId("   ")).toBe(false);
    expect(isValidClientId("\t\n")).toBe(false);
  });

  it("should_reject_short_non_uuid_string", () => {
    expect(isValidClientId("abc")).toBe(false);
    expect(isValidClientId("1234567890")).toBe(false);
  });

  it("should_reject_overly_long_string", () => {
    // 65 字符 → 超出长度上限
    const tooLong = "a".repeat(65);
    expect(isValidClientId(tooLong)).toBe(false);
  });

  it("should_reject_non_string_inputs", () => {
    expect(isValidClientId(null)).toBe(false);
    expect(isValidClientId(undefined)).toBe(false);
    expect(isValidClientId(123)).toBe(false);
    expect(isValidClientId({})).toBe(false);
    expect(isValidClientId([])).toBe(false);
  });

  it("should_reject_injection_like_characters", () => {
    // 含单引号、分号、空格等常见注入字符
    expect(isValidClientId("abc'; DROP TABLE record;--")).toBe(false);
    expect(isValidClientId("550e8400-e29b-41d4-a716-44665544000 ")).toBe(false);
    expect(isValidClientId("550e8400-e29b-41d4-a716-44665544000/")).toBe(false);
  });

  it("should_accept_valid_uuid_v4", () => {
    expect(isValidClientId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("should_accept_uppercase_hex_uuid", () => {
    expect(isValidClientId("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("should_accept_32_char_hex_no_dashes", () => {
    // 32 字符纯 hex（UUID without dashes 变体）
    expect(isValidClientId("550e8400e29b41d4a716446655440000")).toBe(true);
  });
});
