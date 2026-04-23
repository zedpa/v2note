---
id: fix-todo-time-shift
title: "Fix: 待办时间编辑时区偏移"
status: completed
backport: todo-core.md
domain: todo
risk: medium
dependencies: ["todo-core.md"]
superseded_by: null
created: 2026-04-09
updated: 2026-04-09
---

# Fix: 待办时间编辑时区偏移

## 概述
用户编辑待办的时间后，待办被移动到错误的日期和时间。根因是前端解析 `scheduled_start` 时剥离 UTC `Z` 后缀，导致 UTC 时间被当作本地时间解析，产生 -8 小时偏移。对于北京时间 0:00-8:00 的待办，还会导致日期错位到前一天。

## Bug 现象
```
假设 (Given)  用户在北京时间 4/9 创建了一个 9:00 AM 的待办
              DB 存储为 UTC: "2026-04-09T01:00:00Z"
当   (When)   用户打开编辑面板修改时间为 15:00
那么 (Then)   待办应显示为 4/9 15:00
但实际 (But)  待办被移动到了昨天的下午 7 点
```

## 根因分析

### 数据流（当前 — 有 bug）
1. DB 存储 UTC: `"2026-04-09T01:00:00Z"` (= 北京时间 4/9 09:00)
2. API 返回: `"2026-04-09T01:00:00.000Z"` (node-postgres Date → JSON.stringify → toISOString)
3. 前端 `replace(/Z$/i, "")` → `new Date("2026-04-09T01:00:00.000")` → 浏览器当作本地时间 → **1:00 AM** (错误)
4. 提取 date="2026-04-09" time="01:00"
5. 用户改时间为 15:00，保存 `"2026-04-09T15:00:00+08:00"` → DB: `07:00 UTC` → 显示正确但初始时间就错了

### 更严重的场景（北京 0:00-8:00）
1. 待办 3:00 AM 北京时间 4/9 → DB: `"2026-04-08T19:00:00Z"`
2. 前端剥离 Z: `new Date("2026-04-08T19:00:00.000")` → **4/8 19:00** (昨天 7 PM!)
3. date="2026-04-08" → 日期也错位到昨天
4. 用户修改时间后保存，使用了错误的日期 → 待办移到昨天

### 受影响代码（共 5 处）
1. `features/todos/lib/date-utils.ts:27` — `parseScheduledTime()` 剥离 Z
2. `features/todos/components/todo-edit-sheet.tsx:40` — 内联剥离 Z
3. `features/todos/components/todo-detail-sheet.tsx:73` — 内联剥离 Z
4. `features/todos/hooks/use-todo-store.ts:143` — `postponeTodo()` 剥离 Z + `toISOString()` 发送 UTC
5. `features/workspace/components/todo-workspace-view.tsx:513` — 工作区视图时间显示剥离 Z

### 正确的数据流
```
DB: "2026-04-09T01:00:00Z" 
→ new Date("2026-04-09T01:00:00Z")    // 正确解析为 UTC
→ d.getHours() = 9 (本地时区自动转换)  // 浏览器在 +8 区
→ d.getDate() = 9                      // 正确
```

## 修复方案

### 场景 1: 编辑面板正确解析 scheduled_start
```
假设 (Given)  待办 scheduled_start 为 "2026-04-09T01:00:00.000Z" (9AM 北京)
当   (When)   前端解析该时间用于表单初始化
那么 (Then)   date 应为 "2026-04-09"
并且 (And)    time 应为 "09:00"
```

### 场景 2: 跨午夜 UTC 的时间正确解析
```
假设 (Given)  待办 scheduled_start 为 "2026-04-08T19:00:00.000Z" (4/9 3AM 北京)
当   (When)   前端解析该时间
那么 (Then)   date 应为 "2026-04-09"
并且 (And)    time 应为 "03:00"
```

### 场景 3: 编辑时间后保存正确
```
假设 (Given)  待办原始时间为 9:00 AM 4/9
当   (When)   用户将时间改为 15:00 并保存
那么 (Then)   保存的 scheduled_start 应为 "2026-04-09T15:00:00+08:00"
并且 (And)    刷新后显示为 4/9 15:00
```

### 场景 4: parseScheduledTime 正确返回本地 Date
```
假设 (Given)  输入 "2026-04-09T01:00:00.000Z"
当   (When)   调用 parseScheduledTime()
那么 (Then)   返回的 Date.getHours() 应为 9 (北京时间)
并且 (And)    Date.getDate() 应为 9
```

## 修复步骤

1. `date-utils.ts` — `parseScheduledTime()`: 移除 `.replace(/Z$/i, "")`，直接 `new Date(ts)`
2. `todo-edit-sheet.tsx:40` — 改用 `parseScheduledTime(t.scheduled_start)`
3. `todo-detail-sheet.tsx:73` — 改用 `parseScheduledTime(t.scheduled_start)`
4. `use-todo-store.ts:143` — 改用 `parseScheduledTime(todo.scheduled_start)`；line 145 `toISOString()` 改为带时区偏移的本地时间字符串
5. `todo-workspace-view.tsx:513` — 改用 `parseScheduledTime(todo.scheduled_start)`

## 验收行为（E2E 锚点）

### 行为 1: 编辑待办时间不偏移
1. 用户创建待办，设置时间为今天 09:00
2. 用户打开编辑面板
3. 编辑面板应显示 09:00（而非 01:00）
4. 用户将时间改为 15:00 并保存
5. 待办列表应显示今天 15:00（而非昨天 07:00）

### 场景 5: 推迟待办时间正确
```
假设 (Given)  待办 scheduled_start 为 4/9 3:00 AM 北京时间 (DB: "2026-04-08T19:00:00Z")
当   (When)   用户点击"推迟到明天"
那么 (Then)   新时间应为 4/10 3:00 AM 北京时间
并且 (And)    不应为 4/9 19:00 被推迟到 4/10 19:00
```

### 场景 6: 工作区视图时间显示正确
```
假设 (Given)  待办 scheduled_start 为 "2026-04-09T01:00:00Z" (9AM 北京)
当   (When)   工作区视图渲染该待办
那么 (Then)   应显示 "09:00"（而非 "01:00"）
```

## 边界条件
- [x] 北京时间 0:00-8:00 的待办（UTC 日期比北京日期少一天）
- [x] 无 scheduled_start 的待办（不受影响）
- [x] 带 +08:00 偏移的时间字符串（`new Date()` 正确解析带偏移字符串）
- [x] scheduled_start 为 null 时各调用点有守护
- [x] `parseScheduledTime` 的间接消费者（time-slots.ts, todo-grouping.ts）自动受益

## 回归测试
- `features/todos/lib/date-utils.test.ts` — 标注 `regression: fix-todo-time-shift`
