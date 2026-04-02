import { describe, it, expect } from "vitest";
import { buildDateAnchor, fmt } from "./date-anchor.js";
/** 创建指定日期的 Date（本地时间午间，避免时区边界问题） */
function makeDate(y, m, d) {
    return new Date(y, m - 1, d, 12, 0, 0);
}
/** 从 anchor 文本中提取指定行的日期 */
function extractDate(anchor, label) {
    const re = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(\\d{4}-\\d{2}-\\d{2})\\s*\\|`);
    const m = anchor.match(re);
    return m ? m[1] : null;
}
/** 从 anchor 文本中提取"当前"行的星期 */
function extractWeekday(anchor) {
    const m = anchor.match(/当前：\d{4}-\d{2}-\d{2}（周(.)）/);
    return m ? m[1] : null;
}
describe("date-anchor", () => {
    // ── fmt 函数 ───────────────────────────────────────────────────
    describe("fmt", () => {
        it("should_format_date_as_local_YYYY-MM-DD", () => {
            expect(fmt(makeDate(2026, 4, 2))).toBe("2026-04-02");
            expect(fmt(makeDate(2026, 12, 31))).toBe("2026-12-31");
            expect(fmt(makeDate(2026, 1, 1))).toBe("2026-01-01");
        });
        it("should_pad_single_digit_month_and_day", () => {
            expect(fmt(makeDate(2026, 3, 5))).toBe("2026-03-05");
        });
    });
    // ── 周四（2026-04-02） ─────────────────────────────────────────
    describe("周四 (2026-04-02)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 4, 2));
        it("should_show_correct_weekday", () => {
            expect(extractWeekday(anchor)).toBe("四");
        });
        it("should_compute_today_tomorrow_correctly", () => {
            expect(extractDate(anchor, "今天")).toBe("2026-04-02");
            expect(extractDate(anchor, "明天")).toBe("2026-04-03");
            expect(extractDate(anchor, "后天")).toBe("2026-04-04");
            expect(extractDate(anchor, "大后天")).toBe("2026-04-05");
        });
        it("should_compute_this_saturday_as_2_days_later", () => {
            // 周四 → 周六 = +2天
            expect(extractDate(anchor, "这周六/周六")).toBe("2026-04-04");
        });
        it("should_compute_weekend_sunday_as_3_days_later", () => {
            // 周四 → 周日 = +3天
            expect(extractDate(anchor, "周末/这周日/周日")).toBe("2026-04-05");
        });
        it("should_compute_next_monday", () => {
            // 周四 → 下周一 = +4天
            expect(extractDate(anchor, "下周一")).toBe("2026-04-06");
        });
        it("should_compute_next_friday", () => {
            // 周四 → 下周五 = +8天
            expect(extractDate(anchor, "下周五")).toBe("2026-04-10");
        });
        it("should_compute_month_end", () => {
            expect(extractDate(anchor, "月底")).toBe("2026-04-30");
        });
    });
    // ── 周六（2026-04-04） — 边界：今天就是周六 ─────────────────────
    describe("周六 (2026-04-04)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 4, 4));
        it("should_show_correct_weekday", () => {
            expect(extractWeekday(anchor)).toBe("六");
        });
        it("should_compute_this_saturday_as_next_week_when_today_is_saturday", () => {
            // 今天是周六(wd=6) → daysToSat = 7（下周六）
            expect(extractDate(anchor, "这周六/周六")).toBe("2026-04-11");
        });
        it("should_compute_weekend_sunday_as_tomorrow_when_today_is_saturday", () => {
            // 周六 → 周日 = +1天（7 - 6 = 1）
            expect(extractDate(anchor, "周末/这周日/周日")).toBe("2026-04-05");
        });
        it("should_compute_next_monday_from_saturday", () => {
            // 周六 → 下周一 = +2天（8 - 6 = 2）
            expect(extractDate(anchor, "下周一")).toBe("2026-04-06");
        });
    });
    // ── 周日（2026-04-05） — 边界：今天就是周日 ─────────────────────
    describe("周日 (2026-04-05)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 4, 5));
        it("should_show_correct_weekday", () => {
            expect(extractWeekday(anchor)).toBe("日");
        });
        it("should_compute_weekend_sunday_as_next_week_when_today_is_sunday", () => {
            // 今天是周日(wd=0) → daysToSun = 7（下周日）
            expect(extractDate(anchor, "周末/这周日/周日")).toBe("2026-04-12");
        });
        it("should_compute_next_monday_as_tomorrow_when_today_is_sunday", () => {
            // 周日 → 下周一 = +1天
            expect(extractDate(anchor, "下周一")).toBe("2026-04-06");
        });
        it("should_compute_next_friday_from_sunday", () => {
            // 周日 → 下周五 = +5天
            expect(extractDate(anchor, "下周五")).toBe("2026-04-10");
        });
        it("should_compute_this_saturday_from_sunday", () => {
            // 周日(wd=0) → 本周六 = 6 - 0 = 6天后
            expect(extractDate(anchor, "这周六/周六")).toBe("2026-04-11");
        });
    });
    // ── 周一（2026-04-06） — 一周起始 ──────────────────────────────
    describe("周一 (2026-04-06)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 4, 6));
        it("should_compute_this_saturday_5_days_later", () => {
            // 周一 → 周六 = +5天
            expect(extractDate(anchor, "这周六/周六")).toBe("2026-04-11");
        });
        it("should_compute_weekend_sunday_6_days_later", () => {
            // 周一 → 周日 = +6天
            expect(extractDate(anchor, "周末/这周日/周日")).toBe("2026-04-12");
        });
        it("should_compute_next_monday_7_days_later", () => {
            // 周一 → 下周一 = +7天
            expect(extractDate(anchor, "下周一")).toBe("2026-04-13");
        });
        it("should_compute_next_friday_from_monday", () => {
            // 周一(wd=1) → 下周五 = 12 - 1 = 11天
            expect(extractDate(anchor, "下周五")).toBe("2026-04-17");
        });
    });
    // ── 跨月边界：月底（2026-04-30 周四） ─────────────────────────
    describe("月底跨月 (2026-04-30)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 4, 30));
        it("should_compute_tomorrow_as_next_month", () => {
            expect(extractDate(anchor, "明天")).toBe("2026-05-01");
        });
        it("should_compute_month_end_as_today", () => {
            expect(extractDate(anchor, "月底")).toBe("2026-04-30");
        });
    });
    // ── 跨年边界：12月31日 ────────────────────────────────────────
    describe("跨年 (2026-12-31)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 12, 31));
        it("should_compute_tomorrow_as_next_year", () => {
            expect(extractDate(anchor, "明天")).toBe("2027-01-01");
        });
        it("should_compute_month_end_correctly", () => {
            expect(extractDate(anchor, "月底")).toBe("2026-12-31");
        });
    });
    // ── 2月边界（闰年 2028） ───────────────────────────────────────
    describe("2月闰年 (2028-02-28)", () => {
        const anchor = buildDateAnchor(makeDate(2028, 2, 28));
        it("should_compute_tomorrow_as_feb29_in_leap_year", () => {
            expect(extractDate(anchor, "明天")).toBe("2028-02-29");
        });
        it("should_compute_month_end_as_feb29", () => {
            expect(extractDate(anchor, "月底")).toBe("2028-02-29");
        });
    });
    // ── 2月边界（非闰年 2026） ────────────────────────────────────
    describe("2月非闰年 (2026-02-28)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 2, 28));
        it("should_compute_tomorrow_as_mar01_in_non_leap_year", () => {
            expect(extractDate(anchor, "明天")).toBe("2026-03-01");
        });
        it("should_compute_month_end_as_feb28", () => {
            expect(extractDate(anchor, "月底")).toBe("2026-02-28");
        });
    });
    // ── 周五（2026-04-03） — "下周五"不应是本周五 ─────────────────
    describe("周五 (2026-04-03)", () => {
        const anchor = buildDateAnchor(makeDate(2026, 4, 3));
        it("should_compute_this_saturday_as_tomorrow", () => {
            // 周五 → 周六 = +1天
            expect(extractDate(anchor, "这周六/周六")).toBe("2026-04-04");
        });
        it("should_compute_next_friday_not_today", () => {
            // 周五 → 下周五 应该是 +7天，不是今天
            expect(extractDate(anchor, "下周五")).toBe("2026-04-10");
        });
    });
});
//# sourceMappingURL=date-anchor.test.js.map