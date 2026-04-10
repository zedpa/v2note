/** 本地时区日期工具 — 避免 toISOString() 返回 UTC 导致时区偏移 */

const pad = (n: number) => String(n).padStart(2, "0");

/** 将 Date 对象转为本地 YYYY-MM-DD */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 获取本地"今天"的 YYYY-MM-DD */
export function getLocalToday(): string {
  return toLocalDateStr(new Date());
}

/** 将时间戳字符串转为本地 YYYY-MM-DD */
export function toLocalDate(ts: string): string {
  return toLocalDateStr(new Date(ts));
}

/**
 * 将 scheduled_start 解析为本地 Date。
 * DB 存储 UTC（如 "2026-04-09T01:00:00.000Z" = 北京时间 9:00），
 * 直接用 new Date() 解析，浏览器会自动转为本地时区。
 */
export function parseScheduledTime(ts: string): Date {
  return new Date(ts);
}
