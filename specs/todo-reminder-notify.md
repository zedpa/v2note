---
id: "122"
title: "日程提醒 — 本地通知调度"
status: completed
domain: todo
risk: medium
dependencies: ["todo-core.md", "voice-todo-ext.md"]
related: ["recording-resilience.md"]
created: 2026-04-10
updated: 2026-04-10
---

# 日程提醒 — 本地通知调度

## 概述

当待办设置了提醒（`reminder_before` + `scheduled_start`），在设备端调度 Capacitor Local Notification，确保 App 在后台或被杀死时仍能按时提醒用户。

**现状问题**：后端 ProactiveEngine 通过 WebSocket 推送 `proactive.todo_reminder`，但 App 退到后台后 WebSocket 断开，提醒无法送达。

**方案**：前端在待办创建/修改时，用 `@capacitor/local-notifications`（已安装）调度本地通知。通知在 OS 层面定时触发，不依赖网络连接。

## 前置条件

1. `TodoDTO`（`features/todos/lib/todo-types.ts`）需要添加 `reminder_at: string | null` 字段
2. `use-todo-store.ts` 的 `create`/`update` 方法在 API 成功后会调用 `refresh()`，刷新后的 `allTodos` 中包含后端计算的 `reminder_at`——通知调度基于 refresh 后的数据

## 1. 通知调度

### 场景 1.1: 创建带提醒的待办 → 调度本地通知

```
假设 (Given)  用户在 Native App 上操作，通知权限已授予
当   (When)   创建一条待办，scheduled_start = "2026-04-11T09:00:00+08:00"，reminder_before = 15
那么 (Then)   待办创建成功，refresh 后获取后端计算的 reminder_at
并且 (And)    在设备上调度一条本地通知，触发时间 = reminder_at（2026-04-11T00:45:00Z）
并且 (And)    通知标题 = "待办提醒"，内容 = 待办文字
并且 (And)    通知 ID 由 todo.id 确定性映射（相同 todo 总是同一个 ID）
```

### 场景 1.2: 修改 scheduled_start → 重新调度

```
假设 (Given)  一条待办已调度了 08:45 的通知
当   (When)   用户将 scheduled_start 改为 10:00，reminder_before 不变（15分钟）
那么 (Then)   update + refresh 后获取新的 reminder_at
并且 (And)    取消旧通知
并且 (And)    调度新通知（09:45）
```

### 场景 1.3: 修改 reminder_before → 重新调度

```
假设 (Given)  一条待办 scheduled_start = 09:00，reminder_before = 15（通知 08:45）
当   (When)   用户将 reminder_before 改为 30
那么 (Then)   update + refresh 后获取新的 reminder_at
并且 (And)    取消旧通知（08:45）
并且 (And)    调度新通知（08:30）
```

### 场景 1.4: 创建无提醒的待办 → 不调度

```
假设 (Given)  用户创建一条待办，reminder_before 为 null
当   (When)   待办创建成功
那么 (Then)   不调度任何本地通知
```

## 2. 通知取消

### 场景 2.1: 完成待办 → 取消通知

```
假设 (Given)  一条待办已调度了提醒通知
当   (When)   用户标记该待办为已完成（done = true）
那么 (Then)   取消该待办对应的本地通知
```

### 场景 2.2: 删除待办 → 取消通知

```
假设 (Given)  一条待办已调度了提醒通知
当   (When)   用户删除该待办
那么 (Then)   取消该待办对应的本地通知
```

### 场景 2.3: 清除提醒 → 取消通知

```
假设 (Given)  一条待办已调度了提醒通知
当   (When)   用户将 reminder_before 设为"不提醒"（null）
那么 (Then)   取消该待办对应的本地通知
```

## 3. 应用生命周期

### 场景 3.1: App 启动同步

```
假设 (Given)  App 启动
当   (When)   待办列表从 API 加载完成（use-todo-store refresh）
那么 (Then)   遍历所有 done=false 且 reminder_at > now 的待办
并且 (And)    为每条调度本地通知（幂等：相同 ID 先 cancel 再 schedule）
并且 (And)    不调度 reminder_at 已过期（< now）的待办
```

### 场景 3.2: App 从后台恢复

```
假设 (Given)  App 从后台恢复（Capacitor App.addListener("resume")）
当   (When)   resume 事件触发
那么 (Then)   触发 refresh() → syncTodoReminders()
并且 (And)    补调后端 daily-cycle 凌晨生成的周期实例的提醒
```

### 场景 3.3: 前台通知抑制（避免双响）

```
假设 (Given)  App 在前台运行
当   (When)   本地通知到达触发时间
那么 (Then)   通过 Capacitor localNotificationReceived 事件拦截
并且 (And)    不在通知栏弹出（前台由 WebSocket toast 负责提醒）
```

### 场景 3.4: 通知已过期不调度

```
假设 (Given)  一条待办的 reminder_at 已过去（< now）
当   (When)   同步触发
那么 (Then)   跳过该待办，不调度通知
```

## 3a. 提醒设置入口（Agent 工具 + 编辑页）

### 场景 3a.1: AI 对话中设置带提醒的待办 <!-- ✅ completed (fix-reminder-not-working) -->
```
假设 (Given)  用户在聊天中说"提醒我明天9点开会，提前15分钟提醒"
当   (When)   AI 创建该待办
那么 (Then)   待办成功保存，提前 15 分钟的提醒信息一并生效
并且 (And)    待办详情中显示"提前 15 分钟提醒"
并且 (And)    到达提醒时间时，用户能收到本地通知
```

### 场景 3a.2: AI 修改待办时间自动顺延提醒 <!-- ✅ completed (fix-reminder-not-working) -->
```
假设 (Given)  已有一条带"提前 15 分钟提醒"的待办
当   (When)   用户对 AI 说"改到后天 10:00"
那么 (Then)   待办时间更新为后天 10:00
并且 (And)    提醒时间同步更新为后天 09:45
并且 (And)    用户不需要再次手动设置提醒
```

### 场景 3a.3: 编辑页手动设置提醒 <!-- ✅ completed (fix-reminder-not-working) -->
```
假设 (Given)  用户点击一条无提醒的待办，打开编辑页
当   (When)   用户在编辑页看到"提醒"选项并选择"15 分钟前"
那么 (Then)   保存后，该待办的提醒被启用
并且 (And)    再次打开编辑页时，"提醒"选项高亮显示"15 分钟前"
当   (When)   用户重新打开编辑页并选择"不提醒"
那么 (Then)   保存后，该待办的提醒被清除
并且 (And)    不再收到该待办的通知
```

## 4. 通知交互

### 场景 4.1: 点击通知 → 打开 App

```
假设 (Given)  通知已触发，用户看到通知
当   (When)   用户点击通知
那么 (Then)   打开 App（如在后台则唤醒）
并且 (And)    extra 数据中包含 { action: "todo-reminder", todoId: "xxx" }
```

## 5. 平台降级

### 场景 5.1: Web 平台不调度

```
假设 (Given)  运行在浏览器环境（非 Capacitor Native）
当   (When)   待办创建/修改触发通知调度
那么 (Then)   静默跳过（no-op），不报错
并且 (And)    仍依赖 WebSocket push + FAB toast 提醒
```

### 场景 5.2: 通知权限未授予

```
假设 (Given)  用户未授予通知权限
当   (When)   首次尝试调度提醒通知
那么 (Then)   请求权限
并且 (And)    如果拒绝，静默跳过，不阻塞待办操作
```

## 边界条件

- [ ] todo.id → notification ID 映射：使用确定性 hash，范围 [10000, 2147483647]（32 位正整数上限），避免与日报通知 ID（9001/9002）冲突，碰撞概率趋近于零
- [ ] 快速连续修改同一待办的时间：最后一次修改生效（先 cancel 再 schedule 是幂等的）
- [ ] 大量待办同时到达提醒时间：OS 会排队处理，无需应用端节流
- [ ] reminder_at 在过去：不调度
- [ ] scheduled_start 有值但 reminder_before 无值：不调度（reminder_at 为 null）
- [ ] 离线创建待办（无网络）：API 调用失败时不调度（因为 refresh 拿不到 reminder_at）
- [ ] App 被用户强杀：iOS/Android 已调度的 Local Notification 不受影响
- [ ] 多设备同步：每台设备独立调度。设备 A 创建待办后，设备 B 在下次 App 启动/恢复时通过 syncTodoReminders() 自动同步
- [ ] 周期任务实例：后端 daily-cycle 凌晨 3:00 生成带 reminder_at 的实例，App 下次启动/恢复时 sync 自动调度其通知

## 接口约定

### 前置类型变更

```typescript
// features/todos/lib/todo-types.ts — TodoDTO 添加字段
reminder_at: string | null;     // 后端计算的绝对提醒时间（ISO 8601 UTC）
reminder_before: number | null; // 用户设定的提前分钟数
```

### Notification 工具函数（扩展 shared/lib/notifications.ts）

```typescript
/**
 * todo.id (UUID) → 通知 ID (number) 的确定性映射。
 * 范围 [10000, 2147483647]，避免与日报通知 ID 冲突。
 */
export function todoNotificationId(todoId: string): number;

/**
 * 为一条待办调度本地通知。
 * 幂等：相同 todoId 重复调用会先取消再重新调度。
 * Web 平台 no-op。
 */
export async function scheduleTodoReminder(todo: {
  id: string;
  text: string;
  reminder_at: string;    // ISO 8601 UTC
}): Promise<void>;

/**
 * 取消一条待办的本地通知。
 * 幂等：不存在时静默成功。
 * Web 平台 no-op。
 */
export async function cancelTodoReminder(todoId: string): Promise<void>;

/**
 * 同步所有待办的本地通知。
 * 为 pending 的调度，为已过期/已完成的取消。
 * Web 平台 no-op。
 */
export async function syncTodoReminders(todos: Array<{
  id: string;
  text: string;
  done: boolean;
  reminder_at: string | null;
}>): Promise<void>;

/**
 * 注册前台通知拦截：App 在前台时抑制本地通知弹出。
 * 返回清理函数。
 */
export async function addForegroundNotificationSuppressor(): Promise<() => void>;
```

### 调用时机

| 操作 | 调用 | 位置 |
|------|------|------|
| 创建待办（有 reminder） | refresh 后 `scheduleTodoReminder()` | `use-todo-store.ts` → addTodo → refresh 后 |
| 修改待办（时间/提醒变化） | refresh 后 `scheduleTodoReminder()` | `use-todo-store.ts` → updateTodo → refresh 后 |
| 完成待办 | `cancelTodoReminder()` | `use-todo-store.ts` → toggleTodo |
| 删除待办 | `cancelTodoReminder()` | `use-todo-store.ts` → deleteTodo |
| 清除提醒 | `cancelTodoReminder()` | `use-todo-store.ts` → updateTodo（reminder_before=null） |
| App 启动 / 待办列表首次加载 | `syncTodoReminders()` | `use-todo-store.ts` → 首次 refresh 完成后 |
| App 从后台恢复 | refresh → `syncTodoReminders()` | Capacitor `App.resume` 事件 |
| App 前台通知抑制 | `addForegroundNotificationSuppressor()` | App 根组件 mount 时 |

## 验收行为（E2E 锚点）

> 由于涉及 Capacitor 原生 Local Notification，无法通过 Playwright 自动化。
> E2E 验收以 **单元测试 mock + 手动真机测试** 为主。

### 行为 1: 创建带提醒的待办 → 通知已调度
1. 创建待办，设置明天 9:00，提醒 15 分钟前
2. 检查 LocalNotifications.schedule 被调用，时间 = 明天 8:45
3. 通知标题 = "待办提醒"，内容 = 待办文字

### 行为 2: 完成待办 → 通知已取消
1. 有一条带提醒的待办
2. 标记完成
3. 检查 LocalNotifications.cancel 被调用，ID 匹配

### 行为 3: App 启动同步
1. 有 3 条带提醒的待办（1 条已过期，2 条未来）
2. App 启动，待办列表加载完成
3. 调度 2 条未来的通知
4. 不调度已过期的

### 行为 4: 前台通知抑制
1. App 在前台
2. 本地通知触发时间到达
3. 通知不在通知栏弹出
4. WebSocket toast 正常展示

### 行为 5: 真机测试（手动）
1. 创建待办，提醒设置为 1 分钟后
2. 将 App 切到后台
3. 等待 1 分钟
4. 通知在状态栏弹出
5. 点击通知 → App 唤醒

## 实施阶段

### Phase A: 前置类型 + 通知工具函数
1. `TodoDTO` 添加 `reminder_at` 字段
2. 在 `shared/lib/notifications.ts` 中添加 `todoNotificationId()`, `scheduleTodoReminder()`, `cancelTodoReminder()`, `syncTodoReminders()`, `addForegroundNotificationSuppressor()`
3. 单元测试覆盖 ID 映射、调度/取消逻辑、同步逻辑、Web no-op

### Phase B: Todo Store 集成
1. 在 `use-todo-store.ts` 的 refresh 回调后调用通知调度/取消函数
2. 监听 Capacitor App resume 事件触发同步
3. 在 App 根组件注册前台通知拦截器和通知点击监听器

## 备注
- `scheduleTodoReminder` 先 cancel 再 schedule，确保幂等
- 后端 WebSocket push 保留：App 在前台时提供即时 toast，本地通知用于后台触达
- 前台双响防护使用 Capacitor `localNotificationReceived` 事件拦截，不依赖 WebSocket 消息时序
- `reminder_at` 值始终来自后端计算（refresh 后获取），前端不自行计算，遵循时区契约
