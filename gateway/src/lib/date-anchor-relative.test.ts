import { describe, it, expect } from "vitest";
import { formatDateWithRelative, fmt } from "./date-anchor.js";

describe("formatDateWithRelative", () => {
  const today = new Date("2026-04-08T10:00:00");

  it("should_show_today_label_when_same_date", () => {
    const date = new Date("2026-04-08T08:30:00");
    expect(formatDateWithRelative(date, today)).toBe("2026-04-08 今天");
  });

  it("should_show_yesterday_label_when_previous_date", () => {
    const date = new Date("2026-04-07T20:00:00");
    expect(formatDateWithRelative(date, today)).toBe("2026-04-07 昨天");
  });

  it("should_show_only_date_for_older_dates", () => {
    const date = new Date("2026-04-05T12:00:00");
    expect(formatDateWithRelative(date, today)).toBe("2026-04-05");
  });

  it("should_show_only_date_for_future_dates", () => {
    const date = new Date("2026-04-10T09:00:00");
    expect(formatDateWithRelative(date, today)).toBe("2026-04-10");
  });

  it("should_use_current_date_when_no_today_param", () => {
    const now = new Date();
    const result = formatDateWithRelative(now);
    expect(result).toContain("今天");
  });
});

describe("fmt", () => {
  it("should_format_as_iso_date", () => {
    const d = new Date("2026-04-08T15:30:00");
    expect(fmt(d)).toBe("2026-04-08");
  });

  it("should_pad_single_digit_month_and_day", () => {
    const d = new Date("2026-01-05T00:00:00");
    expect(fmt(d)).toBe("2026-01-05");
  });
});
