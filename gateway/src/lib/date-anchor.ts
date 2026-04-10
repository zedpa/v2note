/**
 * 共享时间锚点 — 预计算常用相对日期，嵌入 LLM prompt。
 * LLM 直接查表，禁止自行做日期算术。
 *
 * 所有日期计算使用 Asia/Shanghai 时区（via tz.ts），不依赖 process.env.TZ。
 */

import { TZDate } from "@date-fns/tz";
import { addDays as dfAddDays } from "date-fns";
import { now as tzNow, APP_TZ } from "./tz.js";

/** 格式化日期为 "YYYY-MM-DD"，始终使用 Asia/Shanghai 时区解释 */
export function fmt(d: Date): string {
  const tzd = d instanceof TZDate ? d : new TZDate(d.getTime(), APP_TZ);
  const y = tzd.getFullYear();
  const m = String(tzd.getMonth() + 1).padStart(2, "0");
  const day = String(tzd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, n: number): Date {
  const tzd = base instanceof TZDate ? base : new TZDate(base.getTime(), APP_TZ);
  return dfAddDays(tzd, n);
}

/**
 * 生成预计算时间锚点查找表（Markdown 格式），嵌入 LLM prompt。
 *
 * 规则：
 * - "周末" → 本周日；若今天已是周日 → 下周日
 * - "这周六" → 本周六；若今天已过周六 → 下周六
 * - "下周X" → 下一个自然周的周X
 */
/**
 * 格式化日期并附带相对标记（今天/昨天）。
 * 用于 AI 上下文注入，让 AI 直观判断时间关系。
 */
export function formatDateWithRelative(date: Date, today?: Date): string {
  const ref = today ?? tzNow();
  const dateStr = fmt(date);
  const todayStr = fmt(ref);

  const yesterday = new Date(ref);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmt(yesterday);

  if (dateStr === todayStr) return `${dateStr} 今天`;
  if (dateStr === yesterdayStr) return `${dateStr} 昨天`;
  return dateStr;
}

export function buildDateAnchor(referenceDate?: Date): string {
  const now = referenceDate ?? tzNow();
  const today = fmt(now);
  const wd = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const wdName = ["日", "一", "二", "三", "四", "五", "六"][wd];

  const tomorrow = fmt(addDays(now, 1));
  const dayAfter = fmt(addDays(now, 2));
  const dayAfter3 = fmt(addDays(now, 3));

  // 本周六：若今天 >= 周六(6) → 下周六
  const daysToSat = wd <= 5 ? 6 - wd : 7;
  const thisSat = fmt(addDays(now, daysToSat));

  // 周末/周日：若今天 >= 周日(0在一周头部) → 需要特殊处理
  // JS: 0=Sun, 1=Mon ... 6=Sat
  // 若今天是周日(0) → 下周日(+7)；否则到本周日的天数 = 7 - wd
  const daysToSun = wd === 0 ? 7 : 7 - wd;
  const thisSun = fmt(addDays(now, daysToSun));

  // 下周一：距离下个周一的天数
  const daysToNextMon = wd === 0 ? 1 : 8 - wd;
  const nextMon = fmt(addDays(now, daysToNextMon));

  // 下周五
  const daysToNextFri = wd === 0 ? 5 : wd <= 5 ? 12 - wd : 13 - wd;
  const nextFri = fmt(addDays(now, daysToNextFri));

  // 月底
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEndStr = fmt(monthEnd);

  return `## 时间锚点（直接查表，禁止自行计算）

当前：${today}（周${wdName}）

| 用户说 | 日期 |
|--------|------|
| 今天 | ${today} |
| 明天 | ${tomorrow} |
| 后天 | ${dayAfter} |
| 大后天 | ${dayAfter3} |
| 这周六/周六 | ${thisSat} |
| 周末/这周日/周日 | ${thisSun} |
| 下周一 | ${nextMon} |
| 下周五 | ${nextFri} |
| 月底 | ${monthEndStr} |

输出格式：ISO 8601

时间解析优先级（从高到低）：
1. 用户说了具体时刻 → **精确到分钟**，忽略时段默认值
   "三点" → T15:00:00，"八点半" → T20:30:00，"三点一刻" → T15:15:00
   "两点四十五" → T14:45:00，"九点十分" → T09:10:00
   用上下文判断12h→24h：上午/早上 → +0，下午/晚上 → +12
2. 用户只说了时段（无具体时刻）→ 使用默认值
   "上午" → T09:00:00，"下午" → T14:00:00，"晚上" → T20:00:00
3. 仅日期无任何时间信号 → T09:00:00

其他规则：
- "这周之内""月底前" → 写入 deadline，不是 scheduled_start
- 无任何时间信号 → 不填 scheduled_start
- 不在表中的相对日期（"下下周""下个月15号"）→ 基于当前日期 ${today} 手动计算`;
}
