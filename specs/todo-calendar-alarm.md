---
id: "125"
title: "待办写入系统日历 & 闹钟"
status: completed
domain: todo
risk: low
dependencies: ["todo-core.md", "todo-reminder-notify.md"]
superseded_by: null
created: 2026-04-11
updated: 2026-04-24
---

# 待办写入系统日历 & 闹钟

## 概述

当待办设置了提醒时，除本地通知外，用户可选择「写入日历」或「设闹钟」。采用 Android Intent 方案（`ACTION_INSERT` / `AlarmClock.ACTION_SET_ALARM`），调起系统日历/时钟 App 让用户确认，零权限、实现轻量。

前置：数据库已预埋 `reminder_types TEXT[]`（支持 `notification` / `alarm` / `calendar`）、`calendar_event_id`、`calendar_synced_at` 字段（迁移 048），前端 `command-sheet.tsx` 已有 `types: ("notification" | "alarm" | "calendar")[]` 类型定义。

## 技术方案

- 新建 Capacitor 本地插件 `SystemIntentPlugin.kt`（参考已有 `AudioSessionPlugin.kt` 模式）
- 两个方法：`insertCalendarEvent` / `setAlarm`，均通过 Intent 调起系统 App
- 前端通过 `registerPlugin('SystemIntent')` 调用
- Web 平台 no-op（静默跳过）

---

## 1. 原生插件

### 场景 1.1: 写入系统日历
```
假设 (Given)  App 运行在 Android 原生环境
当   (When)   前端调用 SystemIntent.insertCalendarEvent({ title, description, beginTime, endTime })
那么 (Then)   启动系统日历 App 的新建事件页面
并且 (And)    事件标题、描述、开始/结束时间已预填
并且 (And)    用户确认保存后事件写入系统日历
```

### 场景 1.2: 设置系统闹钟
```
假设 (Given)  App 运行在 Android 原生环境
当   (When)   前端调用 SystemIntent.setAlarm({ hour, minutes, message })
那么 (Then)   启动系统时钟 App 的新建闹钟页面
并且 (And)    时间和标签已预填
并且 (And)    用户确认后闹钟创建
```

### 场景 1.3: Web 平台降级
```
假设 (Given)  App 运行在浏览器环境（非 Capacitor Native）
当   (When)   前端调用 SystemIntent 的任何方法
那么 (Then)   静默跳过，不报错
```

---

## 2. 前端调用集成

### 场景 2.1: 待办设提醒 + 勾选「日历」→ 调起系统日历
```
假设 (Given)  用户编辑待办，设置 scheduled_start = 明天 09:00，reminder_types 包含 "calendar"
当   (When)   用户保存待办
那么 (Then)   待办更新成功后，调用 SystemIntent.insertCalendarEvent
并且 (And)    参数: title = 待办文字, beginTime = scheduled_start 的毫秒时间戳
并且 (And)    endTime = scheduled_end 的毫秒时间戳（如果有），否则 beginTime + estimated_minutes（如果有），否则 beginTime + 30分钟
```

### 场景 2.2: 待办设提醒 + 勾选「闹钟」→ 调起系统闹钟
```
假设 (Given)  用户编辑待办，设置 scheduled_start = 明天 09:00，reminder_before = 15，reminder_types 包含 "alarm"
当   (When)   用户保存待办
那么 (Then)   待办更新成功后，调用 SystemIntent.setAlarm
并且 (And)    参数: hour = 提醒时间的小时, minutes = 提醒时间的分钟, message = 待办文字
并且 (And)    提醒时间 = scheduled_start 减去 reminder_before 分钟（本地时间）
```

### 场景 2.3: reminder_types 包含 notification → 正常调度本地通知
```
假设 (Given)  reminder_types 包含 "notification"
当   (When)   待办保存成功
那么 (Then)   调用现有 scheduleTodoReminder()（不变）
并且 (And)    与日历/闹钟 Intent 互不干扰，各自独立执行
```

### 场景 2.4: 多种类型同时勾选
```
假设 (Given)  reminder_types = ["notification", "calendar", "alarm"]
当   (When)   待办保存成功
那么 (Then)   先执行 scheduleTodoReminder()（本地通知，无 UI）
并且 (And)    然后触发第一个 Intent（日历），用户离开 App 确认
并且 (And)    用户返回 App 后（App.resume 事件），触发下一个 Intent（闹钟）
并且 (And)    如果用户取消某个 Intent 确认，不影响其他类型
```

> **Intent 队列机制**：由于 `startActivity` 会离开 App，多个 Intent 不能连续触发。
> 前端维护一个 Intent 队列，监听 `App.addListener("resume")` 事件，App 回到前台后触发队列中下一个 Intent。队列清空后移除监听。

---

## 3. Android 原生实现要点

### 3.1 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `android/app/src/main/java/com/v2note/app/SystemIntentPlugin.kt` | 新建 | 自定义 Capacitor 插件 |
| `android/app/src/main/java/com/v2note/app/MainActivity.java` | 修改 | 注册 SystemIntentPlugin |

### 3.2 插件代码

```kotlin
@CapacitorPlugin(name = "SystemIntent")
class SystemIntentPlugin : Plugin() {

    @PluginMethod
    fun insertCalendarEvent(call: PluginCall) {
        val beginTime = call.getLong("beginTime")
        val endTime = call.getLong("endTime")
        if (beginTime == null || endTime == null) {
            call.reject("beginTime and endTime are required")
            return
        }
        try {
            val intent = Intent(Intent.ACTION_INSERT).apply {
                data = CalendarContract.Events.CONTENT_URI
                putExtra(CalendarContract.Events.TITLE, call.getString("title", ""))
                putExtra(CalendarContract.Events.DESCRIPTION, call.getString("description", ""))
                putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginTime)
                putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTime)
            }
            val act = activity
            if (act == null || intent.resolveActivity(act.packageManager) == null) {
                call.reject("No calendar app available")
                return
            }
            act.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open calendar: ${e.message}")
        }
    }

    @PluginMethod
    fun setAlarm(call: PluginCall) {
        val hour = call.getInt("hour")
        val minutes = call.getInt("minutes")
        if (hour == null || minutes == null) {
            call.reject("hour and minutes are required")
            return
        }
        try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hour)
                putExtra(AlarmClock.EXTRA_MINUTES, minutes)
                putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("message", ""))
                putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            }
            val act = activity
            if (act == null || intent.resolveActivity(act.packageManager) == null) {
                call.reject("No alarm app available")
                return
            }
            act.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to set alarm: ${e.message}")
        }
    }
}
```

### 3.3 MainActivity 注册

```java
// 在 onCreate 或 init 中
registerPlugin(SystemIntentPlugin.class);
```

### 3.4 前端 TypeScript 定义

```typescript
// shared/lib/system-intent.ts
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SystemIntentPlugin {
  insertCalendarEvent(options: {
    title: string;
    description?: string;
    beginTime: number;   // 毫秒时间戳
    endTime: number;     // 毫秒时间戳
  }): Promise<void>;

  setAlarm(options: {
    hour: number;        // 0-23
    minutes: number;     // 0-59
    message?: string;
  }): Promise<void>;
}

// Web no-op: 非原生平台静默跳过
const noopPlugin: SystemIntentPlugin = {
  insertCalendarEvent: async () => {},
  setAlarm: async () => {},
};

const SystemIntent: SystemIntentPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<SystemIntentPlugin>('SystemIntent')
  : noopPlugin;

export default SystemIntent;
```

---

## 验收行为（E2E 锚点）

> Intent 调用涉及系统 App 跳转，无法 Playwright 自动化。验收以单元测试 mock + 手动真机测试为主。

### 行为 1: 勾选「日历」→ 系统日历弹出
1. 编辑待办，设置明天 09:00，勾选 reminder_types 中的「日历」
2. 保存后，系统日历 App 弹出新建事件页面
3. 事件标题 = 待办文字，开始时间 = 明天 09:00

### 行为 2: 勾选「闹钟」→ 系统时钟弹出
1. 编辑待办，设置明天 09:00，提前 15 分钟提醒，勾选 reminder_types 中的「闹钟」
2. 保存后，系统时钟 App 弹出新建闹钟页面
3. 闹钟时间 = 08:45，标签 = 待办文字

### 行为 3: 同时勾选多种类型
1. 编辑待办，同时勾选通知 + 日历 + 闹钟
2. 保存后，本地通知正常调度
3. 系统日历弹出 → 用户确认/取消
4. 系统时钟弹出 → 用户确认/取消

### 行为 4: Web 环境无报错
1. 在浏览器中编辑待办，勾选日历/闹钟
2. 保存后，无报错，本地通知正常（如果浏览器支持）

## 边界条件
- [ ] scheduled_start 为空时不触发日历/闹钟 Intent（仅 notification 可以基于 reminder_at）
- [ ] reminder_before 为空但勾选了闹钟 → 使用 scheduled_start 的时间作为闹钟时间
- [ ] 系统未安装日历 App → Intent 无法解析，需 try/catch 静默处理
- [ ] 系统未安装时钟 App（极端情况）→ 同上
- [ ] 用户取消 Intent 确认 → 不影响待办本身的保存

## 依赖
- `AudioSessionPlugin.kt` — 作为自定义插件的参考模式
- `shared/lib/notifications.ts` — 现有 notification 调度逻辑
- `features/todos/components/command-sheet.tsx` — 前端 reminder_types UI（已有 alarm/calendar 选项定义）
- `features/todos/hooks/use-todo-store.ts` — 待办保存后的调用入口

## Implementation Phases
- [x] Phase 1: Android 原生插件（SystemIntentPlugin.kt + MainActivity 注册）
- [x] Phase 2: 前端 TypeScript 封装（shared/lib/system-intent.ts + Web no-op）
- [x] Phase 3: Intent 调度逻辑（shared/lib/intent-dispatch.ts — 参数构建 + 队列机制 + 调度入口）
- [x] Phase 4: Todo UI 集成（edit-sheet + create-sheet + use-todo-store 接口扩展 + dispatchIntents 调用）
- [ ] Phase 5: 手动真机验证

## 备注
- Intent 方案不需要 `READ_CALENDAR`/`WRITE_CALENDAR`/`SET_ALARM` 权限
- `EXTRA_SKIP_UI = false` 确保用户有确认机会
- 后续如需静默写入日历（无 UI 确认），需升级为 ContentProvider 方案 + 运行时权限
- `calendar_event_id` 字段暂不使用（Intent 方案无法拿到回调），留给 v3 ContentProvider 方案
- **闹钟无日期概念**：Android `ACTION_SET_ALARM` 只接受 hour/minutes，不支持指定日期。闹钟会在「下一个该时间点」触发。对于 3 天后的待办，闹钟会在明天就响——这是 Android AlarmClock API 的设计限制。如需精确日期闹钟，需使用 AlarmManager（需要 `SCHEDULE_EXACT_ALARM` 权限），留给 v3
