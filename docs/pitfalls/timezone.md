# 时区陷阱

> 按需加载：当改动涉及 `gateway/src/` 日期逻辑、前端日期显示、`new Date()`、`toISOString()` 等，Claude 会被注入此文件。

## Gateway（后端）

- **禁止** `new Date()` / `new Date().toISOString()` 做日期计算（服务器可能在 UTC 时区）
- **禁止** `toISOString().split("T")[0]`（返回 UTC 日期）
- **禁止** `created_at.split("T")[0]`（DB 可能返回 UTC ISO）
- 必须使用 `lib/tz.ts` 导出函数：`today()`, `daysAgo(n)`, `toLocalDate(d)`, `todayRange()`, `dayRange()`, `weekRange()`, `monthRange()`, `tzNow()`, `toLocalDateTime(ts)`
- tz.ts 硬编码 Asia/Shanghai，不依赖 `process.env.TZ`
- DB 连接池已设 `SET timezone = 'Asia/Shanghai'`
- 来源：fix-timezone-systematic

## 前端（浏览器）

- 解析后端 `timestamptz`：**直接 `new Date(isoString)`**，浏览器自动按本地时区处理
- **禁止** `.replace(/Z$/i, "")` 剥离 Z 后缀 → 会把 UTC 当本地时间，产生 -8h 偏移
- 获取"今天日期"：**禁止** `new Date().toISOString().split("T")[0]`（返回 UTC 日期，北京 0:00-8:00 会错一天）
- 必须用 `getLocalToday()` 或 `toLocalDateStr(new Date())`（来自 `features/todos/lib/date-utils.ts`）
- 从时间戳提取日期：**禁止** `ts.split("T")[0]` → 用 `toLocalDate(ts)` 或 `toLocalDateStr(new Date(ts))`
- 构造带时区字符串：`${date}T${time}:00${localTzOffset()}`
- 来源：fix-todo-time-shift

## 速查：允许 / 禁止

```typescript
// ❌ 全部禁止
new Date().toISOString().split("T")[0]     // UTC 日期
ts.replace(/Z$/i, "")                      // 剥离时区
someDate.split("T")[0]                     // UTC 日期提取
new Date()  // 仅在 gateway 中禁止，用 tzNow()

// ✅ 正确做法
getLocalToday()                            // 前端：本地今天
toLocalDateStr(new Date(ts))               // 前端：时间戳→本地日期
toLocalDate(ts)                            // 前端：时间戳→本地日期字符串
parseScheduledTime(ts)                     // 前端：解析为本地 Date
tzNow()                                    // 后端：当前时间
today()                                    // 后端：今天日期字符串
toLocalDateTime(ts)                        // 后端：给 AI/用户看的本地时间
```
