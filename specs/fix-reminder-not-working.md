---
id: "fix-reminder-not-working"
title: "Fix: 提醒功能未生效 — Agent工具+编辑页+recalc"
status: completed
backport: todo-reminder-notify.md#场景 3a.1
domain: todo
risk: medium
dependencies: ["todo-core.md", "todo-reminder-notify.md", "todo-calendar-alarm.md"]
created: 2026-04-12
updated: 2026-04-12
---

# Fix: 提醒功能未生效

## 概述

用户反馈闹钟、日历、提前通知等提醒功能实际均未生效，包括 AI Agent 工具也无法设置提醒。

**根因**：多个集成断点导致提醒功能端到端不可用：
1. Agent 工具 `create_todo` / `update_todo` 的 schema 缺少 `reminder_before`、`reminder_types` 参数
2. `create_todo` handler 创建待办后未传递 reminder 字段到 DB
3. `update_todo` handler 修改 scheduled_start 后未触发 `recalcReminderAt`
4. `todo-edit-sheet.tsx`（手动编辑页面）完全没有提醒设置 UI
5. `send_notification` 工具只写 DB，不触发任何原生推送

## 1. Agent 工具 — 缺少提醒参数

### 场景 1.1: AI 创建带提醒的待办
```
假设 (Given)  用户对 AI 说"提醒我明天9点开会，提前15分钟提醒"
当   (When)   AI 调用 create_todo 工具
那么 (Then)   工具 schema 接受 reminder_before: 15, reminder_types: ["notification"]
并且 (And)    handler 计算 reminder_at = scheduled_start - 15分钟
并且 (And)    写入 DB 的 todo 包含 reminder_at, reminder_before, reminder_types
```

### 场景 1.2: AI 更新待办的提醒设置
```
假设 (Given)  已有一条待办，scheduled_start = 明天 9:00，无提醒
当   (When)   AI 调用 update_todo，设置 reminder_before = 30
那么 (Then)   handler 计算 reminder_at = scheduled_start - 30分钟
并且 (And)    更新 DB 中的 reminder_at, reminder_before
```

### 场景 1.3: AI 修改待办时间 → 自动重算提醒
```
假设 (Given)  已有一条待办，scheduled_start = 明天 9:00, reminder_before = 15
当   (When)   AI 调用 update_todo，只修改 scheduled_start = 后天 10:00
那么 (Then)   handler 调用 recalcReminderAt 重算 reminder_at = 后天 9:45
```

### 场景 1.4: AI 清除提醒
```
假设 (Given)  已有一条带提醒的待办
当   (When)   AI 调用 update_todo，设置 reminder_before = null
那么 (Then)   handler 清除 reminder_at, reminder_before, reminder_types
```

### 场景 1.5: AI 设置闹钟/日历类型提醒
```
假设 (Given)  用户说"帮我设个闹钟提醒明天开会"
当   (When)   AI 调用 create_todo，reminder_types = ["alarm", "notification"]
那么 (Then)   DB 中写入 reminder_types = ["alarm", "notification"]
并且 (And)    前端同步后触发 Intent 队列（日历/闹钟系统 App）
```

### 场景 1.6: AI 同时修改时间和提醒
```
假设 (Given)  已有一条待办，scheduled_start = 明天 9:00, reminder_before = 15
当   (When)   AI 调用 update_todo，scheduled_start = 后天 10:00, reminder_before = 30
那么 (Then)   handler 用新的 scheduled_start 和新的 reminder_before 计算 reminder_at
并且 (And)    reminder_at = 后天 9:30（10:00 - 30分钟）
并且 (And)    不触发 recalcReminderAt（因为已显式传了 reminder_before）
```

## 2. update_todo handler — 绕过 recalc 逻辑

### 场景 2.1: 工具改时间不触发 recalc
```
假设 (Given)  REST 路由 PATCH /api/v1/todos/:id 有 recalcReminderAt 逻辑
当   (When)   update_todo 工具只调 todoRepo.update，不调 recalcReminderAt
那么 (Then)   已有提醒的待办被改时间后，reminder_at 仍指向旧时间
并且 (And)    通知在错误的时间触发
```

**修复**: update_todo handler 在 `scheduled_start` 变更且 `reminder_before` 未传时，调用 `todoRepo.recalcReminderAt`。

## 3. todo-edit-sheet — 无提醒 UI

### 场景 3.1: 用户手动编辑待办想设提醒
```
假设 (Given)  用户在待办列表点击某条待办，打开编辑页
当   (When)   编辑页显示日期、时间、时长、优先级
那么 (Then)   缺少"提醒"设置选项
并且 (And)    用户无法通过编辑页设置/修改/取消提醒
```

**修复**: 在 todo-edit-sheet 中添加提醒时间选择器（0/5/15/30/60分钟前），复用 CommandSheet 已有的 UI 模式。

## 4. send_notification 工具 — 写 DB 未推送

### 场景 4.1: AI 主动发通知，用户看不到
```
假设 (Given)  AI 判断需要提醒用户，调用 send_notification
当   (When)   工具将通知写入 notification 表
那么 (Then)   如果 WebSocket 连接中 → 前端通过 WS 收到通知（已有）
并且 (And)    如果 App 在后台/断连 → 用户看不到通知（无 native push）
```

**暂不修复**：此问题需要 FCM/APNs 集成，超出本次修复范围。本次只修复 Agent 工具 + 编辑页 + recalc 逻辑。

## 验收行为（E2E 锚点）

> Agent 工具和 Intent 涉及原生平台，无法 Playwright 自动化。以单元测试 + 手动验证为主。

### 行为 1: AI 创建带提醒的待办
1. 在聊天中说"提醒我明天早上9点开会，提前15分钟"
2. AI 调用 create_todo，包含 reminder_before: 15
3. 待办列表中出现该待办，reminder_before = 15, reminder_at 有值
4. 手机端能收到本地通知

### 行为 2: AI 修改时间后提醒同步更新
1. 对上述待办说"改到后天10点"
2. AI 调用 update_todo 修改 scheduled_start
3. reminder_at 自动更新为新时间 - 15分钟

### 行为 3: 编辑页设置提醒
1. 点击一条无提醒的待办，打开编辑页
2. 看到"提醒"选项（不提醒/5分/15分/30分/1小时）
3. 选择"15分钟前"
4. 保存后，API 发送 reminder_before: 15
5. 待办的 reminder_at 被计算并存入 DB

### 行为 4: 编辑页取消提醒
1. 点击一条有提醒的待办，打开编辑页
2. "提醒"选项高亮当前值
3. 选择"不提醒"
4. 保存后，reminder_before 和 reminder_at 被清空

## 边界条件
- [ ] create_todo 无 scheduled_start 但有 reminder_before → 不设提醒（因为无法算 reminder_at）
- [ ] update_todo 只改 reminder_before 未改 scheduled_start → 用现有 scheduled_start 重算
- [ ] AI 传裸时间（无时区）→ ensureTz 自动补 +08:00
- [ ] reminder_before = 0 → handler 显式判断，等同于 null，不设提醒（schema 用 `.min(1)` 约束正整数）
- [ ] 编辑页中，无 scheduled_start 时不显示提醒选项（因为无法算提醒时间）
- [ ] 编辑页不提供 reminder_types 选择（alarm/calendar），默认 ["notification"]。闹钟/日历类型仍通过 CommandSheet 设置

## 接口约定

### create_todo 工具 schema 新增
```typescript
reminder_before: z.number().min(1).optional().describe("可选：提前提醒分钟数（5/15/30/60）"),
reminder_types: z.array(z.enum(["notification", "alarm", "calendar"])).optional()
  .describe("可选：提醒类型，默认 [\"notification\"]"),
```

### update_todo 工具 schema 新增
```typescript
reminder_before: z.number().nullable().optional()
  .describe("可选：提前提醒分钟数（null=清除提醒）"),
reminder_types: z.array(z.enum(["notification", "alarm", "calendar"])).nullable().optional()
  .describe("可选：提醒类型"),
```

## 实施阶段

- [x] Phase 1: Agent 工具修复（create_todo + update_todo schema + handler）
- [x] Phase 2: todo-edit-sheet 添加提醒 UI
- [x] Phase 3: 单元测试（16 个，全部通过）
- [ ] Phase 4: 手动真机验证

## 备注
- send_notification 原生推送问题需 FCM/APNs，不在本次范围
- 本地通知调度（Capacitor LocalNotifications）已在 use-todo-store 中集成，只要 DB 中 reminder_at 正确，前端 sync 会自动调度
- 日历/闹钟 Intent 已在 CommandSheet 的 onConfirm 中集成，但 todo-edit-sheet 未集成（本次一并修复）
- **本次修复一并完成 spec 125 (todo-calendar-alarm.md) 的 Phase 4 (Todo UI 集成)**：todo-edit-sheet 保存后调用 dispatchTodoReminders
