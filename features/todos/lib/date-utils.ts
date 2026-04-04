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
 * AI 输出的时间是用户本地时间（如 "2026-04-04T20:30:00"），
 * 但经过 PostgreSQL timestamptz 存储后变成 "2026-04-04T20:30:00.000Z"。
 * 去掉 Z 后缀避免被浏览器当作 UTC 解析。
 */
export function parseScheduledTime(ts: string): Date {
  return new Date(ts.replace(/Z$/i, ""));
}
