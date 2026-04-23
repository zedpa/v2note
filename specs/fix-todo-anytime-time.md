---
id: "fix-todo-anytime-time"
title: "Fix: 随时时段创建待办被自动赋予时间"
status: completed
backport: todo-ui.md#场景 1.4a
domain: todo
risk: low
dependencies: ["todo-core.md", "todo-ui.md"]
superseded_by: null
created: 2026-04-16
updated: 2026-04-16
---

# Fix: 随时时段创建待办被自动赋予时间

## 概述
在待办时间视图中，点击「随时」时段的 "+" 按钮创建待办时，虽然时间输入框正确显示为空，但提交时 `handleSubmit` 将空时间回退为 `"09:00"`，导致待办被赋予 `scheduled_start`，在时间视图中错误地显示在「上午」而非「随时」。

## Bug 现象
- 用户在时间视图点击「随时」区域的 "+" 创建待办
- 时间输入框显示为空（正确）
- 提交后待办出现在「上午 9:00」时段，而非「随时」
- 因为 `const t = time || "09:00"` 将空时间强制回退为 09:00

## 根因
`features/todos/components/todo-create-sheet.tsx` 第 87 行：
```typescript
const t = time || "09:00";
```
当 `date` 非空但 `time` 为空时（anytime 场景），仍然构造了带时间的 `scheduledStart`。

## 修复方案

**策略**：用 `00:00:00` 作为「无具体时间」的哨兵值。当 `time` 为空时，设 `scheduledStart` 为当日 `00:00:00`（保留日期用于 filterByDate），同时在 `assignTimeSlot` 中将精确午夜（hour=0, minutes=0）判定为 "anytime"。

### 场景 1: 随时时段创建待办 — 归入随时
```
假设 (Given)  用户在时间视图某日的「随时」区域点击 "+"
当   (When)   用户输入待办文字并提交，未手动设置时间
那么 (Then)   待办的 scheduled_start = "${date}T00:00:00${tz}"（哨兵值）
并且 (And)    assignTimeSlot 识别 00:00 为 "anytime"，待办显示在「随时」区域
```

### 场景 2: 随时时段创建待办后用户手动设置时间
```
假设 (Given)  用户在时间视图某日的「随时」区域点击 "+"
当   (When)   用户手动点击时间选择器设置了时间（如 14:00），然后提交
那么 (Then)   待办的 scheduled_start 包含日期和时间（如 "2026-04-16T14:00:00+08:00"）
并且 (And)    待办按 assignTimeSlot 归入对应时段（下午）
```

### 场景 3: 有时间时段（上午/下午/晚上）创建待办行为不变
```
假设 (Given)  用户在时间视图某日的「上午」区域点击 "+"
当   (When)   用户输入待办文字并提交（时间预填为 09:00）
那么 (Then)   待办的 scheduled_start 包含日期和预填时间
并且 (And)    行为与修复前一致
```

### 场景 4: 未来日期的随时待办
```
假设 (Given)  用户在时间视图选择了未来日期（如明天）
当   (When)   用户在「随时」区域创建待办，未设置时间
那么 (Then)   待办的 scheduled_start = "${明天日期}T00:00:00${tz}"
并且 (And)    待办在明天的时间视图中显示在「随时」区域
并且 (And)    待办不会出现在今天的时间视图中
```

### 场景 5: 已有的无 scheduled_start 待办仍归入随时
```
假设 (Given)  数据库中存在 scheduled_start = null 的待办
当   (When)   时间视图加载该待办
那么 (Then)   assignTimeSlot(null) 仍返回 "anytime"
并且 (And)    行为与修复前一致
```

## 验收行为（E2E 锚点）

> 以下描述纯用户视角的操作路径

### 行为 1: 随时时段创建待办
1. 用户打开待办页面，进入时间视图
2. 用户点击「随时」区域的 "+" 按钮
3. 用户输入待办文字 "测试随时"，不点击时间选择器
4. 用户点击「添加任务」
5. 待办应出现在「随时」区域下，不应出现在「上午」「下午」「晚上」任何时段

### 行为 2: 未来日期随时时段创建待办
1. 用户在时间视图切换到明天的日期
2. 用户点击「随时」区域的 "+" 按钮
3. 用户输入待办文字 "明天随时"，不设置时间
4. 用户点击「添加任务」
5. 待办应出现在明天的「随时」区域下
6. 切回今天，该待办不应出现

## 边界条件
- [x] 空时间 + 有日期 → scheduled_start = date + 00:00:00（哨兵），归入 anytime
- [x] 有时间 + 有日期 → 正常设 scheduled_start
- [x] 空时间 + 空日期 → 不设 scheduled_start（默认行为）
- [x] 未来日期 + 空时间 → 哨兵值保证日期过滤正确
- [x] 已有 null scheduled_start → 仍归入 anytime（向后兼容）

## 接口约定

### 修改 1: `todo-create-sheet.tsx` 的 `handleSubmit`

```typescript
// 修复前
if (date) {
  const tz = localTzOffset();
  const t = time || "09:00";
  scheduledStart = `${date}T${t}:00${tz}`;
}

// 修复后
if (date) {
  const tz = localTzOffset();
  const t = time || "00:00"; // 无时间时用 00:00 哨兵
  scheduledStart = `${date}T${t}:00${tz}`;
}
```

### 修改 2: `time-slots.ts` 的 `assignTimeSlot`

```typescript
// 在函数开头，null 检查之后添加
const d = parseScheduledTime(scheduledStart);
const hour = d.getHours();
const minutes = d.getMinutes();

// 精确午夜 = 无具体时间安排 → 随时
if (hour === 0 && minutes === 0) return "anytime";
```

## Implementation Phases
- [ ] Phase 1: 修改 assignTimeSlot，将精确 00:00 视为 anytime
- [ ] Phase 2: 修改 handleSubmit，空时间用 "00:00" 替代 "09:00"
