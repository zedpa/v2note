/**
 * 共享时间锚点 — 预计算常用相对日期，嵌入 LLM prompt。
 * LLM 直接查表，禁止自行做日期算术。
 */

export function fmt(d: Date): string {
  // 使用本地日期，避免 UTC 时区偏移（如 UTC+8 下 4月30日00:00 → UTC 4月29日）
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * 生成预计算时间锚点查找表（Markdown 格式），嵌入 LLM prompt。
 *
 * 规则：
 * - "周末" → 本周日；若今天已是周日 → 下周日
 * - "这周六" → 本周六；若今天已过周六 → 下周六
 * - "下周X" → 下一个自然周的周X
 */
export function buildDateAnchor(referenceDate?: Date): string {
  const now = referenceDate ?? new Date();
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
