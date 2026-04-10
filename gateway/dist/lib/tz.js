/**
 * 统一时区工具 — 基于 @date-fns/tz，硬编码 Asia/Shanghai
 *
 * 解决的问题：`new Date().toISOString().split("T")[0]` 在 UTC+8 凌晨返回 UTC 日期（即"昨天"）。
 * 本模块所有函数显式使用 Asia/Shanghai 时区，不依赖 process.env.TZ。
 *
 * 日期字符串 = "YYYY-MM-DD"（本地日期，用于显示/比较）
 * UTC ISO 字符串 = "2026-04-07T16:00:00.000Z"（精确时刻，用于 DB WHERE）
 */
import { TZDate } from "@date-fns/tz";
import { format, subDays, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
/**
 * 应用业务时区（硬编码，不依赖 process.env.TZ）。
 * Asia/Shanghai 无 DST，偏移量固定 +08:00。dayRange() 利用此假设硬编码 +08:00。
 */
export const APP_TZ = "Asia/Shanghai";
// ── 基础：获取当前时区感知的时间 ──
/** 获取当前 Asia/Shanghai 时间的 TZDate 对象 */
export function now() {
    return new TZDate(Date.now(), APP_TZ);
}
// ── 日期字符串（"YYYY-MM-DD"）──
/** 当前本地日期 */
export function today() {
    return format(now(), "yyyy-MM-dd");
}
/** N 天前的本地日期 */
export function daysAgo(n) {
    return format(subDays(now(), n), "yyyy-MM-dd");
}
/** N 天后的本地日期 */
export function daysLater(n) {
    return format(addDays(now(), n), "yyyy-MM-dd");
}
/**
 * 任意 Date/ISO string/timestamp 转本地日期 "YYYY-MM-DD"。
 * - null/undefined → 返回 today()
 * - 裸日期 "2026-04-08" → 原样返回
 * - ISO with Z → 按 Asia/Shanghai 转换
 * - ISO with offset → 按 Asia/Shanghai 转换
 */
export function toLocalDate(d) {
    if (d == null)
        return today();
    if (typeof d === "string") {
        // 裸日期字符串（无时间部分）→ 原样返回
        if (/^\d{4}-\d{2}-\d{2}$/.test(d))
            return d;
        // ISO 字符串 → 转为 TZDate
        const tzd = new TZDate(new Date(d).getTime(), APP_TZ);
        return format(tzd, "yyyy-MM-dd");
    }
    if (typeof d === "number") {
        return format(new TZDate(d, APP_TZ), "yyyy-MM-dd");
    }
    // Date object
    return format(new TZDate(d.getTime(), APP_TZ), "yyyy-MM-dd");
}
/**
 * 任意 Date/ISO string 转本地日期时间 "YYYY-MM-DD HH:mm"。
 * 用于返回给 AI 的人类可读时间（避免 AI 误读 UTC 日期）。
 */
export function toLocalDateTime(d) {
    if (d == null)
        return `${today()} 00:00`;
    const ms = typeof d === "string" ? new Date(d).getTime()
        : typeof d === "number" ? d
            : d.getTime();
    return format(new TZDate(ms, APP_TZ), "yyyy-MM-dd HH:mm");
}
// ── UTC ISO 时间范围（用于 DB WHERE 子句）──
/**
 * 本地"今天"的起止时间。
 * @returns UTC ISO-8601 timestamps
 */
export function todayRange() {
    return dayRange(today());
}
/**
 * 本地指定日期的起止时间。
 * @param dateStr "YYYY-MM-DD" 格式的本地日期
 * @returns UTC ISO-8601 timestamps（始终以 Z 结尾）
 */
export function dayRange(dateStr) {
    // 构造该日期在 Asia/Shanghai 时区的 00:00 和 23:59:59.999，然后转为 UTC
    const startMs = new Date(`${dateStr}T00:00:00+08:00`).getTime();
    const endMs = new Date(`${dateStr}T23:59:59.999+08:00`).getTime();
    return {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
    };
}
/**
 * 本地"本周"的起止日期。周一为起始。
 * @returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 */
export function weekRange() {
    const n = now();
    const monday = startOfWeek(n, { weekStartsOn: 1 });
    const sunday = endOfWeek(n, { weekStartsOn: 1 });
    return {
        start: format(monday, "yyyy-MM-dd"),
        end: format(sunday, "yyyy-MM-dd"),
    };
}
/**
 * 本地"本月"的起止日期。
 * @returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 */
export function monthRange() {
    const n = now();
    return {
        start: format(startOfMonth(n), "yyyy-MM-dd"),
        end: format(endOfMonth(n), "yyyy-MM-dd"),
    };
}
//# sourceMappingURL=tz.js.map