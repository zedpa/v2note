---
id: "111"
title: "Fix: Voice→Todo 管线接通"
status: completed
backport: voice-todo-ext.md#场景 D11
domain: voice
risk: medium
dependencies: ["voice-routing.md", "voice-todo-ext.md"]
superseded_by: null
created: 2026-04-04
updated: 2026-04-04
---

# Fix: Voice→Todo 管线接通

## 概述

voice-routing 和 voice-todo-ext 的后端（三层路由、AI提取、DB schema、调度引擎）已全部完成，但**前端确认→API创建的链路断裂**：AI 提取了完整的 goal_hint/reminder/recurrence 数据，经过 CommandSheet 确认后调用 createTodo 时被丢弃。本 spec 修复所有断裂点，使语音→待办全链路贯通。

---

## Phase 1: API 层补字段（后端）

### 场景 1.1: POST /api/v1/todos 接受 reminder + recurrence 字段
```
假设 (Given)  gateway/src/routes/todos.ts POST readBody 类型不含 reminder/recurrence
当   (When)   前端传入 reminder_before=30, reminder_types=["notification"], recurrence_rule="daily"
那么 (Then)   readBody 类型扩展，新增字段：
              - priority: number
              - reminder_before: number
              - reminder_types: string[]
              - recurrence_rule: string
              - recurrence_end: string
并且 (And)    传入 reminder_before + scheduled_start 时自动计算 reminder_at：
              reminder_at = new Date(scheduled_start).getTime() - reminder_before * 60000
并且 (And)    这些字段透传给 todoRepo.create / todoRepo.dedupCreate
```

### 场景 1.2: PATCH /api/v1/todos/:id 接受 reminder + recurrence 字段
```
假设 (Given)  gateway/src/routes/todos.ts PATCH readBody 类型不含 reminder/recurrence
当   (When)   前端传入 reminder_before=15
那么 (Then)   readBody 类型扩展，新增同 1.1 的字段
并且 (And)    若同时传入 scheduled_start + reminder_before，自动重算 reminder_at
并且 (And)    若只传入 scheduled_start（未传 reminder_before），查询已有 reminder_before 重算
并且 (And)    清除提醒：reminder_before=null → 同时清空 reminder_at, reminder_types
```

### 接口约定

```typescript
// POST /api/v1/todos — 新增字段
interface CreateTodoBody {
  // ...已有字段
  priority?: number;             // 已在 DB 但 route 未接受
  reminder_before?: number | null;
  reminder_types?: string[] | null;
  recurrence_rule?: string | null;
  recurrence_end?: string | null;
}

// PATCH /api/v1/todos/:id — 新增字段
interface UpdateTodoBody {
  // ...已有字段
  reminder_before?: number | null;
  reminder_types?: string[] | null;
  recurrence_rule?: string | null;
  recurrence_end?: string | null;
}
```

### 关键文件
- `gateway/src/routes/todos.ts` — POST readBody 补 priority/reminder_*/recurrence_* 字段；PATCH 同理
- `gateway/src/routes/todos.ts` — POST/PATCH 内计算 reminder_at

---

## Phase 2: 前端 API 类型补齐

### 场景 2.1: createTodo 类型补全
```
假设 (Given)  shared/lib/api/todos.ts createTodo fields 不含 reminder/recurrence
当   (When)   CommandSheet 确认创建待办
那么 (Then)   createTodo 参数类型扩展：
              + reminder_before?: number
              + reminder_types?: string[]
              + recurrence_rule?: string
              + recurrence_end?: string
```

### 场景 2.2: updateTodo 类型补全
```
假设 (Given)  shared/lib/api/todos.ts updateTodo fields 不含 reminder/recurrence
当   (When)   CommandSheet 确认修改待办
那么 (Then)   updateTodo 参数类型扩展，同 2.1
```

### 关键文件
- `shared/lib/api/todos.ts` — createTodo/updateTodo 类型扩展

---

## Phase 3: handleCommandConfirm 补全字段

### 场景 3.1: create 时传递全部字段
```
假设 (Given)  app/page.tsx:208 handleCommandConfirm 中 createTodo 只传 text/scheduled_start/estimated_minutes/priority
当   (When)   AI 提取结果包含 goal_hint(_matched_goal_id)、reminder、recurrence
那么 (Then)   补传以下字段：
              - goal_id: cmd.todo._matched_goal_id（如有）
              - reminder_before: cmd.todo.reminder?.before_minutes
              - reminder_types: cmd.todo.reminder?.types
              - recurrence_rule: cmd.todo.recurrence?.rule
              - recurrence_end: cmd.todo.recurrence?.end_date
              - person: cmd.todo.person（保留在 todo 扩展字段或忽略）
```

### 场景 3.2: modify 时传递全部字段
```
假设 (Given)  handleCommandConfirm modify 分支只传 text/scheduled_start/estimated_minutes/priority
当   (When)   AI 返回 changes 包含 reminder 或 recurrence 变更
那么 (Then)   补传 reminder_before/reminder_types/recurrence_rule/recurrence_end
```

### 场景 3.3: 周期任务创建后立即生成今日实例
```
假设 (Given)  用户语音创建了周期任务（recurrence_rule 非空）
当   (When)   handleCommandConfirm 调用 createTodo 成功
那么 (Then)   系统在创建周期模板后自动生成今日实例
              （复用周期实例生成逻辑）
并且 (And)    前端无需额外调用
```

### 关键文件
- `app/page.tsx` — handleCommandConfirm 函数
- `gateway/src/routes/todos.ts` — POST 中检测 recurrence_rule 非空时创建今日实例

---

## Phase 4: CommandSheet 多指令独立确认

### 场景 4.1: 每张卡片有独立 ✓/✕ 按钮
```
假设 (Given)  AI 返回 2+ 条 commands
当   (When)   CommandSheet 展示结果
那么 (Then)   每张 CommandCard 右上角显示 ✕ 按钮（点击移除该指令）
并且 (And)    底部保留 [ 全部确认 ] 按钮
并且 (And)    确认时只提交未被移除的 commands
```

### 场景 4.2: 移除后卡片带删除线动画退出
```
假设 (Given)  用户点击某条指令的 ✕
当   (When)   动画完成
那么 (Then)   该卡片从列表移除
并且 (And)    如果所有卡片都被移除，自动关闭弹窗
```

### 关键文件
- `features/todos/components/command-sheet.tsx` — CommandCard 增加 ✕ 按钮，editableCommands 增加 dismissed 状态

---

## Phase 5: 继续说话修改

### 场景 5.1: 点击麦克风重新录音
```
假设 (Given)  CommandSheet 展示了识别结果
当   (When)   用户点击 🎙 继续说话
那么 (Then)   CommandSheet 保持打开（phase 不变）
并且 (And)    触发 FAB 开始新一轮录音
并且 (And)    录音过程中麦克风按钮变为红色脉冲
```

### 场景 5.2: 修改指令发给 AI 更新
```
假设 (Given)  用户继续说了"改成4点，优先级高"，ASR 完成
当   (When)   前端收到新转写
那么 (Then)   将 { current_commands: 当前editableCommands, modification: 新转写 } 发给 gateway
              gateway 调用 AI（fast 模型）返回更新后的 commands
并且 (And)    CommandSheet 原地刷新，变化的字段短暂高亮（0.5s 黄色闪烁）
```

### 场景 5.3: 修改 API
```
假设 (Given)  需要新的 gateway endpoint 处理修改
当   (When)   前端 POST /api/v1/voice/modify-commands
那么 (Then)   body: { commands: TodoCommand[], modification_text: string, dateAnchor: string }
              AI prompt: "用户已有以下待办指令 JSON，现在用户说了'{modification_text}'，请返回更新后的 commands"
              返回: { commands: TodoCommand[] }
```

### 关键文件
- `app/page.tsx` — onContinueSpeak 实现：触发录音 → ASR完成 → 调修改API → 刷新commands
- `gateway/src/routes/todos.ts` — 新增 POST /api/v1/voice/modify-commands
- `gateway/src/handlers/todo-extract-prompt.ts` — 新增 buildModifyCommandsPrompt
- `features/todos/components/command-sheet.tsx` — 高亮动画

---

## Phase 6: 静默执行 + Toast 撤销

### 场景 6.1: 设置中可关闭确认弹窗
```
假设 (Given)  shared/lib/local-config.ts 已有 confirm_before_execute 字段
当   (When)   用户在设置页面切换"执行前确认"开关
那么 (Then)   将 confirm_before_execute 写入 localStorage
```

### 场景 6.2: 关闭后静默执行
```
假设 (Given)  confirm_before_execute = false
当   (When)   process.result 返回 todo_commands
那么 (Then)   不弹出 CommandSheet
并且 (And)    直接执行全部 commands（调用 handleCommandConfirm 逻辑）
并且 (And)    执行完成后弹出 toast："已创建：{text} · {time} [撤销]"
```

### 场景 6.3: 5秒内可撤销
```
假设 (Given)  toast 显示中（5秒计时）
当   (When)   用户点击 [撤销]
那么 (Then)   create → deleteTodo(刚创建的id)
              complete → updateTodo(id, { done: false })
              modify → updateTodo(id, { ...原始值 })（需保存原值）
并且 (And)    toast 更新为"已撤销"
并且 (And)    触发 recording:processed 事件刷新列表
```

### 关键文件
- `features/settings/lib/settings-schema.json` — 新增 confirm_before_execute 开关
- `app/page.tsx` — process.result 监听中读取设置，分流到弹窗 vs 静默
- `shared/components/undo-toast.tsx` — 或复用 features/todos/hooks/use-undo-toast.ts

---

## Phase 7: 清理 + 小修

### 场景 7.1: 删除 voice-action.ts 死代码
```
假设 (Given)  ACTION_PATTERNS 数组和 mayBeAction() 函数已不被调用
当   (When)   执行清理
那么 (Then)   删除 ACTION_PATTERNS（约 65-76 行）
并且 (And)    删除 mayBeAction()（约 79-81 行）
并且 (And)    保留 classifyVoiceIntent 和 executeVoiceAction 不变
```

### 场景 7.2: 修改时间自动重算 reminder_at
```
假设 (Given)  用户通过 PATCH 修改了 scheduled_start
当   (When)   该待办有 reminder_before > 0
那么 (Then)   自动重算 reminder_at = new_scheduled_start - reminder_before * 60000
并且 (And)    重置 reminder_sent = false（允许重新提醒）
```

### 关键文件
- `gateway/src/handlers/voice-action.ts` — 删除死代码
- `gateway/src/routes/todos.ts` — PATCH 中检测 scheduled_start 变更时重算 reminder_at

---

## 实施顺序

| Phase | 内容 | 复杂度 | 依赖 |
|-------|------|--------|------|
| **1** | API 层补字段 | 低 | 无 |
| **2** | 前端 API 类型补齐 | 低 | Phase 1 |
| **3** | handleCommandConfirm 补全 | 低 | Phase 2 |
| **4** | 多指令独立确认 | 中 | 无 |
| **5** | 继续说话修改 | 中 | 新 endpoint |
| **6** | 静默执行 + 撤销 | 中 | Phase 3 |
| **7** | 清理 + reminder 重算 | 低 | Phase 1 |

Phase 1→2→3 是串行依赖（**接通核心管线**），其余可并行。

## 验证方式

- **Phase 1-3**: 待办页语音"明天下午3点开会提前30分钟提醒我" → DB 查询确认 reminder_at/reminder_before/reminder_types 字段非空
- **Phase 3 周期**: 语音"每天早上8点锻炼" → DB 确认模板+今日实例均创建
- **Phase 4**: 语音"明天3点开会，周五交报告" → 弹窗2张卡片，点✕移除一张 → 确认 → 只创建1条
- **Phase 5**: 弹窗展示后点🎙说"改成4点" → 卡片时间刷新为16:00
- **Phase 6**: 设置关闭确认 → 语音创建 → toast出现 → 点撤销 → todo被删
- **Phase 7**: voice-action.ts 无 ACTION_PATTERNS；修改todo时间 → reminder_at自动重算

## 备注

- Phase 1 的 priority 字段：POST route 当前漏接了 priority（DB/todoRepo 支持），一并补上
- Phase 3 的 _matched_goal_id：process.ts 将匹配结果存在 `(cmd.todo as any)._matched_goal_id`，前端需要从 todo_commands 中读取此字段传给 API 的 goal_id
- Phase 5 修改 API 可放在 voice route 下（/api/v1/voice/modify-commands）而非 todos route
- E3b "查看原文" UI 属于 todo-ui spec 范畴，不在本修复范围内
