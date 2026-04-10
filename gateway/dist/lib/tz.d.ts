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
/**
 * 应用业务时区（硬编码，不依赖 process.env.TZ）。
 * Asia/Shanghai 无 DST，偏移量固定 +08:00。dayRange() 利用此假设硬编码 +08:00。
 */
export declare const APP_TZ = "Asia/Shanghai";
/** 获取当前 Asia/Shanghai 时间的 TZDate 对象 */
export declare function now(): TZDate;
/** 当前本地日期 */
export declare function today(): string;
/** N 天前的本地日期 */
export declare function daysAgo(n: number): string;
/** N 天后的本地日期 */
export declare function daysLater(n: number): string;
/**
 * 任意 Date/ISO string/timestamp 转本地日期 "YYYY-MM-DD"。
 * - null/undefined → 返回 today()
 * - 裸日期 "2026-04-08" → 原样返回
 * - ISO with Z → 按 Asia/Shanghai 转换
 * - ISO with offset → 按 Asia/Shanghai 转换
 */
export declare function toLocalDate(d: Date | string | number | null | undefined): string;
/**
 * 任意 Date/ISO string 转本地日期时间 "YYYY-MM-DD HH:mm"。
 * 用于返回给 AI 的人类可读时间（避免 AI 误读 UTC 日期）。
 */
export declare function toLocalDateTime(d: Date | string | number | null | undefined): string;
/**
 * 本地"今天"的起止时间。
 * @returns UTC ISO-8601 timestamps
 */
export declare function todayRange(): {
    start: string;
    end: string;
};
/**
 * 本地指定日期的起止时间。
 * @param dateStr "YYYY-MM-DD" 格式的本地日期
 * @returns UTC ISO-8601 timestamps（始终以 Z 结尾）
 */
export declare function dayRange(dateStr: string): {
    start: string;
    end: string;
};
/**
 * 本地"本周"的起止日期。周一为起始。
 * @returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 */
export declare function weekRange(): {
    start: string;
    end: string;
};
/**
 * 本地"本月"的起止日期。
 * @returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 */
export declare function monthRange(): {
    start: string;
    end: string;
};
