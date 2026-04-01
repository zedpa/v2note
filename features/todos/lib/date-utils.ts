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
