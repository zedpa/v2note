---
id: "fix-tz"
title: "Fix: 系统性时区问题 — toISOString().split(T)[0] 全量替换"
status: completed
domain: infra
risk: high
dependencies: []
created: 2026-04-08
updated: 2026-04-08
---

# Fix: 系统性时区问题

## 概述

gateway 中大量使用 `new Date().toISOString().split("T")[0]` 获取"今天的日期"，但 `toISOString()` 返回 UTC 时间。在 UTC+8 时区下，每天 00:00~08:00 之间该模式返回"昨天"的日期，导致搜索、日报、统计、导出等功能在凌晨时段全面异常。

## 根因

`Date.toISOString()` 始终返回 UTC，`split("T")[0]` 截取的是 UTC 日期而非本地日期。
项目已有 `lib/date-anchor.ts` 的 `fmt()` 函数（使用 `getFullYear()/getMonth()/getDate()` 取本地日期），但大量代码未使用它。
此外，PostgreSQL 端的 `CURRENT_DATE`、`DATE(col)`、`NOW()::date` 也依赖 PG 服务端时区设置，与 Node.js 端形成平行的时区问题。

## 修复方案

1. 在 gateway 中安装 `date-fns` + `@date-fns/tz`
2. 创建 `gateway/src/lib/tz.ts` 统一时区工具模块，基于 `@date-fns/tz` 的 `TZDate`
3. 全量替换所有 `toISOString().split("T")[0]` 和 `created_at.split("T")[0]` 模式
4. 统一手动日期拼接函数为 `tz.ts` 导出
5. PostgreSQL 连接池设置 `SET timezone = 'Asia/Shanghai'`，确保 DB 端日期函数与 Node.js 端一致
6. 保留 `date-anchor.ts` 的 prompt 锚点功能，内部日期计算改用 `tz.ts`

## 1. 统一时区工具模块

### 场景 1.1: tz.ts 导出 today() 返回本地日期
```
假设 (Given)  服务器运行在 TZ=Asia/Shanghai 或未设置 TZ
当   (When)   调用 today()
那么 (Then)   返回格式为 "YYYY-MM-DD" 的 Asia/Shanghai 本地日期
并且 (And)    在 UTC+8 凌晨 00:00~08:00 之间，返回的日期与 toISOString().split("T")[0] 不同
```

### 场景 1.2: daysAgo(n) 正确计算 N 天前的本地日期
```
假设 (Given)  当前本地时间为 2026-04-08 02:00 (UTC = 2026-04-07 18:00)
当   (When)   调用 daysAgo(1)
那么 (Then)   返回 "2026-04-07"（本地昨天）
并且 (And)    不返回 "2026-04-06"（UTC 的昨天）
```

### 场景 1.3: todayRange() 返回 UTC ISO 时间戳用于 DB 查询
```
假设 (Given)  当前本地日期为 2026-04-08 (Asia/Shanghai)
当   (When)   调用 todayRange()
那么 (Then)   返回 { start: "2026-04-07T16:00:00.000Z", end: "2026-04-08T15:59:59.999Z" }
并且 (And)    start 对应上海 4/8 00:00:00，end 对应上海 4/8 23:59:59.999
```

### 场景 1.4: toLocalDate(dateStr) 将 TIMESTAMPTZ 转为本地日期
```
假设 (Given)  数据库返回 created_at = "2026-04-08T01:30:00+08:00"
当   (When)   调用 toLocalDate("2026-04-08T01:30:00+08:00")
那么 (Then)   返回 "2026-04-08"

假设 (Given)  数据库返回 created_at = "2026-04-07T17:30:00.000Z"（UTC 表示的上海 4/8 01:30）
当   (When)   调用 toLocalDate("2026-04-07T17:30:00.000Z")
那么 (Then)   返回 "2026-04-08"（按 Asia/Shanghai 转换）

假设 (Given)  输入为裸日期字符串 "2026-04-08"（无时区信息）
当   (When)   调用 toLocalDate("2026-04-08")
那么 (Then)   返回 "2026-04-08"（原样返回）

假设 (Given)  输入为 null 或 undefined
当   (When)   调用 toLocalDate(null)
那么 (Then)   返回 today()（安全 fallback）
```

### 场景 1.5: PostgreSQL 连接时区对齐
```
假设 (Given)  Supabase PostgreSQL 默认运行在 UTC 时区
当   (When)   gateway 连接池初始化时
那么 (Then)   执行 SET timezone = 'Asia/Shanghai'
并且 (And)    后续 SQL 中的 CURRENT_DATE / DATE(col) / NOW() 返回 Asia/Shanghai 本地值
```

## 2. 高风险文件替换

以下文件必须替换 `toISOString().split("T")[0]` 为 tz.ts 工具：

| 文件 | 问题描述 |
|------|---------|
| `handlers/chat.ts:357-358` | weekAgo/today 用于 deep skill 上下文预取 |
| `cognitive/report.ts:34` | `today()` 本地函数定义用 toISOString |
| `cognitive/daily-cycle.ts:146` | todayStr 用 toISOString |
| `cognitive/batch-analyze-prompt.ts:196` | dateStr 计算 |
| `cognitive/action-panel.ts:95-98` | todayStart/todayEnd 依赖 TZ + toISOString |
| `diary/manager.ts:16` | today 用 toISOString |
| `routes/export.ts:44,54,67` | 导出文件名日期 |
| `routes/notebooks.ts:72-73` | 默认日期范围 |
| `routes/stats.ts:11-18` | 周统计 monday/sunday + setHours + toISOString |
| `db/repositories/subscription.ts:7-8,26-27` | 月初/月末范围混合时区 |
| `db/repositories/todo.ts:345` | streak 计算 |
| `index.ts:353,375` | 两处 today |
| `handlers/digest.ts:262` | today |
| `handlers/voice-action.ts:454,459` | resolveDate 用 toISOString（与 search.ts 同名但未修复！） |
| `cognitive/alerts.ts:30` | 手动 formatDate() |

## 3. 中风险文件替换

以下文件使用 `created_at.split("T")[0]` 截取日期，如果 DB 返回 UTC ISO 格式会得到错误日期：

| 文件 | 行号 | 问题描述 |
|------|------|---------|
| `cognitive/advisor-context.ts` | 176,273,278,309,329 | 5 处 `.split("T")[0]` 用于 AI 参谋上下文日期标注 |
| `cognitive/person-profile.ts` | 197 | Strike 日期显示 |
| `tools/search.ts` | 133 | 搜索结果二次日期过滤 |
| `handlers/voice-action.ts` | 332 | scheduled_start 日期截取 |
| `handlers/daily-loop.ts` | 91-92 | 日期中文拼接 getMonth()/getDate() |
| `proactive/engine.ts` | 616-617 | 时间窗口计算 |

## 4. 手动日期拼接函数统一

### 场景 4.1: 消除 alerts.ts 中的 formatDate()
```
假设 (Given)  cognitive/alerts.ts 中有独立的 formatDate() 函数（手动拼接）
当   (When)   替换为 tz.ts 的 toLocalDate()
那么 (Then)   行为完全一致，且所有日期格式化走统一路径
```

### 场景 4.2: 消除 report.ts 中的 today() 闭包
```
假设 (Given)  cognitive/report.ts 中有 `const today = () => new Date().toISOString().split("T")[0]`
当   (When)   替换为 import { today } from "../lib/tz.js"
那么 (Then)   凌晨时段返回正确的本地日期
```

## 5. 数据库端时区对齐

### 场景 5.1: notification.ts 的 CURRENT_DATE 查询
```
假设 (Given)  notification.ts 使用 `created_at::date = CURRENT_DATE` 判断今日通知
      并且    PG 连接已设置 timezone = 'Asia/Shanghai'
当   (When)   凌晨 01:00 (UTC+8) 查询
那么 (Then)   CURRENT_DATE 返回本地日期 "2026-04-08"
并且 (And)    不返回 UTC 日期 "2026-04-07"
```

### 场景 5.2: stats.ts 的 DATE(created_at) 统计
```
假设 (Given)  stats.ts 使用 DATE(created_at) 做日/周统计分组
      并且    PG 连接已设置 timezone = 'Asia/Shanghai'
当   (When)   凌晨时段查询
那么 (Then)   DATE(created_at) 按 Asia/Shanghai 转换，与 Node.js 的 today() 一致
```

## 验收行为（E2E 锚点）

### 行为 1: 凌晨搜索日记
1. 用户在对话中输入"搜索昨天的日记"
2. AI 调用 search 工具，filters.date = "yesterday"
3. 返回的结果全部是本地"昨天"的记录
4. 无论服务器 UTC 时间是几号

### 行为 2: 凌晨创建的日记归属正确日期
1. 用户在凌晨 01:00（UTC+8）通过语音创建一条日记
2. 日记的 created_at 存储 UTC 时间戳
3. 搜索"今天的日记"能找到这条记录
4. 导出时文件名日期正确

## 边界条件
- [x] UTC+8 凌晨 00:00~08:00 是高危时段（UTC 日期 = 本地昨天）
- [ ] TZ 环境变量未设置时，tz.ts 用硬编码 APP_TZ = "Asia/Shanghai"，不依赖 process.env.TZ
- [ ] 数据库 TIMESTAMPTZ 字段在 node-postgres 中自动转为本地 Date
- [ ] 所有 range 函数（todayRange/dayRange/weekRange/monthRange）返回 UTC ISO 格式用于 DB WHERE
- [ ] `toLocalDate()` 接收 null/undefined 时安全 fallback 到 today()
- [ ] `toLocalDate()` 接收裸日期字符串 "2026-04-08" 时原样返回
- [ ] `toISOString()` 用于存储精确时间戳是正确的，只有 `.split("T")[0]` 取日期部分有问题
- [ ] `setHours(0,0,0,0)` 模式在 TZ 正确时可工作，但替换为 tz.ts 消除隐式依赖
- [ ] Asia/Shanghai 无 DST，tz.ts 注释中说明此假设
- [ ] 测试文件中的 `toISOString().split("T")[0]` 也需同步修复，否则凌晨 CI 会误报

## 接口约定

```typescript
// gateway/src/lib/tz.ts 导出接口

/** 应用业务时区（硬编码，不依赖 process.env.TZ） */
const APP_TZ = "Asia/Shanghai";

/** 当前本地日期 "YYYY-MM-DD" */
function today(): string;

/** N 天前的本地日期 "YYYY-MM-DD" */
function daysAgo(n: number): string;

/** N 天后的本地日期 "YYYY-MM-DD" */
function daysLater(n: number): string;

/** 任意 Date/ISO string/null 转本地日期 "YYYY-MM-DD"。null → today() */
function toLocalDate(d: Date | string | number | null | undefined): string;

/** 本地"今天"的起止时间 @returns UTC ISO-8601 timestamps（用于 DB WHERE） */
function todayRange(): { start: string; end: string };

/** 本地指定日期的起止时间 @returns UTC ISO-8601 timestamps */
function dayRange(dateStr: string): { start: string; end: string };

/** 本地"本周"的起止日期 @returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } */
function weekRange(): { start: string; end: string };

/** 本地"本月"的起止日期 @returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } */
function monthRange(): { start: string; end: string };
```

## Implementation Phases
- [ ] Phase 1: 安装 date-fns + @date-fns/tz，创建 tz.ts + 单元测试
- [ ] Phase 2: DB 连接池设置 SET timezone = 'Asia/Shanghai'
- [ ] Phase 3: 替换所有高风险文件（15 处）
- [ ] Phase 4: 替换所有中风险文件（6 处）
- [ ] Phase 5: 统一手动日期函数（alerts.ts formatDate, report.ts today 等）
- [ ] Phase 6: 修复 voice-action.ts 的 resolveDate（独立于 search.ts 的同名函数）
- [ ] Phase 7: 同步修复测试文件中的 toISOString().split 模式
- [ ] Phase 8: 更新 CLAUDE.md 已知陷阱和 date-anchor.ts

## 备注
- 根已有 date-fns 4.1.0，gateway 需独立安装 date-fns + @date-fns/tz
- `toISOString()` 用于生成精确时间戳（如存 DB）是安全的，不需要替换
- `search.ts` 的 `resolveDate` 已由 fix-morning-briefing 修复为 `fmt()`，本次统一为 tz.ts
- `voice-action.ts:450-467` 有独立的 `resolveDate` 函数仍用 `toISOString().split`，是遗漏
- 修复完成后，CLAUDE.md 陷阱规则应更新为"使用 tz.ts 导出函数"而非"使用 fmt()"
- `fmt()` 保留作为 date-anchor.ts 的内部实现，外部代码统一使用 tz.ts
