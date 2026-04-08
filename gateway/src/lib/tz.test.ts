import { describe, it, expect, vi, afterEach } from "vitest";
import { today, daysAgo, daysLater, toLocalDate, todayRange, dayRange, weekRange, monthRange, APP_TZ } from "./tz.js";

describe("tz.ts — 统一时区工具", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("today()", () => {
    it("should_return_local_date_when_utc_is_previous_day", () => {
      // 模拟 UTC+8 凌晨 02:00 → UTC 前一天 18:00
      // 本地日期 = 2026-04-08，UTC 日期 = 2026-04-07
      vi.setSystemTime(new Date("2026-04-07T18:00:00.000Z")); // UTC 4/7 18:00 = Shanghai 4/8 02:00
      expect(today()).toBe("2026-04-08");
      // 对比：toISOString 会返回错误的 UTC 日期
      expect(new Date().toISOString().split("T")[0]).toBe("2026-04-07"); // 这就是 bug
    });

    it("should_return_same_date_when_utc_and_local_agree", () => {
      // UTC+8 下午 14:00 → UTC 06:00，同一天
      vi.setSystemTime(new Date("2026-04-08T06:00:00.000Z")); // Shanghai 14:00
      expect(today()).toBe("2026-04-08");
    });

    it("should_return_correct_date_at_midnight_boundary", () => {
      // 恰好本地 00:00:00（UTC 16:00 前一天）
      vi.setSystemTime(new Date("2026-04-07T16:00:00.000Z")); // Shanghai 4/8 00:00:00
      expect(today()).toBe("2026-04-08");
    });

    it("should_return_correct_date_just_before_midnight", () => {
      // 本地 23:59:59（UTC 15:59:59）
      vi.setSystemTime(new Date("2026-04-08T15:59:59.000Z")); // Shanghai 4/8 23:59:59
      expect(today()).toBe("2026-04-08");
    });
  });

  describe("daysAgo(n)", () => {
    it("should_return_local_yesterday_not_utc_yesterday", () => {
      // 本地 4/8 02:00，UTC 4/7 18:00
      vi.setSystemTime(new Date("2026-04-07T18:00:00.000Z"));
      expect(daysAgo(1)).toBe("2026-04-07"); // 本地昨天
      // 如果用 UTC：昨天是 4/6（错误）
    });

    it("should_handle_month_boundary", () => {
      // 本地 5/1 01:00，UTC 4/30 17:00
      vi.setSystemTime(new Date("2026-04-30T17:00:00.000Z"));
      expect(daysAgo(1)).toBe("2026-04-30"); // 本地昨天
      expect(today()).toBe("2026-05-01");
    });

    it("should_handle_year_boundary", () => {
      // 本地 2027-01-01 03:00，UTC 2026-12-31 19:00
      vi.setSystemTime(new Date("2026-12-31T19:00:00.000Z"));
      expect(today()).toBe("2027-01-01");
      expect(daysAgo(1)).toBe("2026-12-31");
    });
  });

  describe("daysLater(n)", () => {
    it("should_return_local_tomorrow", () => {
      vi.setSystemTime(new Date("2026-04-07T18:00:00.000Z")); // Shanghai 4/8 02:00
      expect(daysLater(1)).toBe("2026-04-09");
    });
  });

  describe("toLocalDate()", () => {
    it("should_convert_utc_iso_to_local_date", () => {
      // UTC 4/7 17:30 = Shanghai 4/8 01:30
      expect(toLocalDate("2026-04-07T17:30:00.000Z")).toBe("2026-04-08");
    });

    it("should_convert_offset_iso_to_local_date", () => {
      expect(toLocalDate("2026-04-08T01:30:00+08:00")).toBe("2026-04-08");
    });

    it("should_return_bare_date_as_is", () => {
      expect(toLocalDate("2026-04-08")).toBe("2026-04-08");
    });

    it("should_fallback_to_today_for_null", () => {
      vi.setSystemTime(new Date("2026-04-07T18:00:00.000Z")); // Shanghai 4/8
      expect(toLocalDate(null)).toBe("2026-04-08");
      expect(toLocalDate(undefined)).toBe("2026-04-08");
    });

    it("should_handle_date_object", () => {
      const d = new Date("2026-04-07T17:30:00.000Z"); // Shanghai 4/8 01:30
      expect(toLocalDate(d)).toBe("2026-04-08");
    });

    it("should_handle_timestamp_number", () => {
      const ts = new Date("2026-04-07T17:30:00.000Z").getTime();
      expect(toLocalDate(ts)).toBe("2026-04-08");
    });
  });

  describe("todayRange()", () => {
    it("should_return_utc_boundaries_for_local_today", () => {
      vi.setSystemTime(new Date("2026-04-07T18:00:00.000Z")); // Shanghai 4/8 02:00
      const range = todayRange();
      // Shanghai 4/8 00:00 = UTC 4/7 16:00
      expect(range.start).toBe("2026-04-07T16:00:00.000Z");
      // Shanghai 4/8 23:59:59.999 = UTC 4/8 15:59:59.999
      expect(range.end).toBe("2026-04-08T15:59:59.999Z");
    });
  });

  describe("dayRange(dateStr)", () => {
    it("should_return_utc_boundaries_for_given_date", () => {
      const range = dayRange("2026-04-08");
      expect(range.start).toBe("2026-04-07T16:00:00.000Z");
      expect(range.end).toBe("2026-04-08T15:59:59.999Z");
    });

    it("should_handle_month_start", () => {
      const range = dayRange("2026-05-01");
      expect(range.start).toBe("2026-04-30T16:00:00.000Z");
      expect(range.end).toBe("2026-05-01T15:59:59.999Z");
    });
  });

  describe("weekRange()", () => {
    it("should_return_monday_to_sunday_local_dates", () => {
      // 2026-04-08 是周三
      vi.setSystemTime(new Date("2026-04-08T06:00:00.000Z")); // Shanghai 14:00
      const range = weekRange();
      expect(range.start).toBe("2026-04-06"); // 周一
      expect(range.end).toBe("2026-04-12");   // 周日
    });

    it("should_use_local_date_for_week_boundary_at_midnight", () => {
      // Shanghai 4/8 02:00 (周三)，UTC 4/7 (周二)
      vi.setSystemTime(new Date("2026-04-07T18:00:00.000Z"));
      const range = weekRange();
      expect(range.start).toBe("2026-04-06"); // 本地周一（不是 UTC 的周一 4/5）
      expect(range.end).toBe("2026-04-12");
    });
  });

  describe("monthRange()", () => {
    it("should_return_first_and_last_day_of_local_month", () => {
      vi.setSystemTime(new Date("2026-04-08T06:00:00.000Z"));
      const range = monthRange();
      expect(range.start).toBe("2026-04-01");
      expect(range.end).toBe("2026-04-30");
    });

    it("should_use_local_month_at_midnight", () => {
      // Shanghai 5/1 01:00，UTC 4/30 17:00
      vi.setSystemTime(new Date("2026-04-30T17:00:00.000Z"));
      const range = monthRange();
      expect(range.start).toBe("2026-05-01"); // 本地 5 月
      expect(range.end).toBe("2026-05-31");
    });
  });

  describe("APP_TZ", () => {
    it("should_be_asia_shanghai", () => {
      expect(APP_TZ).toBe("Asia/Shanghai");
    });
  });
});
