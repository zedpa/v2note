import { describe, it, expect } from "vitest";
import { parseScheduledTime, toLocalDateStr, toLocalDate } from "./date-utils";

describe("regression: fix-todo-time-shift", () => {
  // 模拟北京时间 UTC+8 环境的测试
  // 注意: 这些测试在任何时区都能验证核心逻辑——
  // parseScheduledTime 应该正确解析 UTC ISO 字符串为本地时间

  it("should parse UTC ISO string correctly (not strip Z)", () => {
    // "2026-04-09T01:00:00.000Z" = UTC 01:00 = 北京 09:00
    const d = parseScheduledTime("2026-04-09T01:00:00.000Z");
    // 验证 Date 对象表示的时间点正确（UTC 毫秒数）
    expect(d.getTime()).toBe(new Date("2026-04-09T01:00:00.000Z").getTime());
  });

  it("should parse UTC midnight-crossing correctly", () => {
    // "2026-04-08T19:00:00.000Z" = UTC 19:00 Apr 8 = 北京 03:00 Apr 9
    const d = parseScheduledTime("2026-04-08T19:00:00.000Z");
    expect(d.getTime()).toBe(new Date("2026-04-08T19:00:00.000Z").getTime());
    // 本地日期应由浏览器时区决定，不应被 Z-strip 影响
    // 在 UTC+8: getDate() = 9, getHours() = 3
    // 关键：不能是 Apr 8 19:00（那是 Z-strip 的错误结果）
  });

  it("should handle timezone offset strings correctly", () => {
    // 带偏移的字符串也应正确解析
    const d = parseScheduledTime("2026-04-09T09:00:00+08:00");
    expect(d.getTime()).toBe(new Date("2026-04-09T01:00:00.000Z").getTime());
  });

  it("should handle string without timezone as local time", () => {
    // 无时区信息的字符串被当作本地时间（浏览器行为）
    const d = parseScheduledTime("2026-04-09T09:00:00");
    expect(d.getHours()).toBe(9);
    expect(d.getDate()).toBe(9);
  });

  it("toLocalDateStr should return local YYYY-MM-DD", () => {
    const d = new Date(2026, 3, 9); // April 9, 2026 local
    expect(toLocalDateStr(d)).toBe("2026-04-09");
  });

  it("toLocalDate should convert timestamp to local date string", () => {
    // 在任何时区，toLocalDate 应返回本地日期
    const result = toLocalDate("2026-04-09T09:00:00+08:00");
    // 在 UTC+8: 2026-04-09; 在 UTC: 2026-04-09 (01:00 UTC)
    expect(result).toMatch(/^2026-04-0[89]$/);
  });
});
