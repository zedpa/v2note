import { describe, it, expect } from "vitest";
import { assignTimeSlot, getDefaultHourForSlot, TIME_SLOTS } from "./time-slots";

describe("assignTimeSlot", () => {
  it("should_return_anytime_when_no_scheduled_start", () => {
    expect(assignTimeSlot(null)).toBe("anytime");
    expect(assignTimeSlot(undefined)).toBe("anytime");
    expect(assignTimeSlot("")).toBe("anytime");
  });

  it("should_return_morning_when_hour_between_5_and_11", () => {
    expect(assignTimeSlot("2026-03-31T05:00:00")).toBe("morning");
    expect(assignTimeSlot("2026-03-31T09:30:00")).toBe("morning");
    expect(assignTimeSlot("2026-03-31T11:59:00")).toBe("morning");
  });

  it("should_return_afternoon_when_hour_between_12_and_17", () => {
    expect(assignTimeSlot("2026-03-31T12:00:00")).toBe("afternoon");
    expect(assignTimeSlot("2026-03-31T14:30:00")).toBe("afternoon");
    expect(assignTimeSlot("2026-03-31T17:59:00")).toBe("afternoon");
  });

  it("should_return_evening_when_hour_between_18_and_23", () => {
    expect(assignTimeSlot("2026-03-31T18:00:00")).toBe("evening");
    expect(assignTimeSlot("2026-03-31T21:00:00")).toBe("evening");
    expect(assignTimeSlot("2026-03-31T23:59:00")).toBe("evening");
  });

  it("should_return_evening_when_hour_between_0_and_4_next_day", () => {
    expect(assignTimeSlot("2026-04-01T00:00:00")).toBe("evening");
    expect(assignTimeSlot("2026-04-01T02:30:00")).toBe("evening");
    expect(assignTimeSlot("2026-04-01T04:59:00")).toBe("evening");
  });

  it("should_return_morning_when_hour_is_5_boundary", () => {
    // 05:00 是上午的边界
    expect(assignTimeSlot("2026-03-31T05:00:00")).toBe("morning");
    // 04:59 是晚上（跨日）
    expect(assignTimeSlot("2026-03-31T04:59:00")).toBe("evening");
  });
});

describe("getDefaultHourForSlot", () => {
  it("should_return_null_for_anytime", () => {
    expect(getDefaultHourForSlot("anytime")).toBeNull();
  });

  it("should_return_9_for_morning", () => {
    expect(getDefaultHourForSlot("morning")).toBe(9);
  });

  it("should_return_14_for_afternoon", () => {
    expect(getDefaultHourForSlot("afternoon")).toBe(14);
  });

  it("should_return_19_for_evening", () => {
    expect(getDefaultHourForSlot("evening")).toBe(19);
  });
});

describe("TIME_SLOTS", () => {
  it("should_have_4_slots_in_order", () => {
    expect(TIME_SLOTS).toHaveLength(4);
    expect(TIME_SLOTS.map((s) => s.key)).toEqual([
      "anytime",
      "morning",
      "afternoon",
      "evening",
    ]);
  });

  it("should_have_chinese_labels", () => {
    expect(TIME_SLOTS.map((s) => s.label)).toEqual([
      "随时",
      "上午",
      "下午",
      "晚上",
    ]);
  });
});
