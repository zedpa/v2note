---
id: fix-calendar-swipe
title: "Fix: 日历滑动与Tab切换手势冲突"
status: completed
backport: app-mobile-views.md#场景 1.2a
domain: ui
risk: low
dependencies: ["app-mobile-views.md", "todo-ui.md"]
superseded_by: null
created: 2026-04-08
updated: 2026-04-08
---

# Fix: 日历滑动与Tab切换手势冲突

## Bug 现象

待办页时间视图中，用户在日历条（CalendarStrip）上左右滑动切换周时，同时触发了页面级的 tab 切换（待办 ↔ 日记），导致：
1. 滑动日历不仅切换了周，还意外切换了 tab
2. 用户无法正常使用日历的左右滑动功能

## 复现条件

1. 打开待办页（todo tab）
2. 在时间视图的日历条区域左右滑动
3. 滑动距离 > 80px 时同时触发日历切换周和 tab 切换

## 根因分析

- `app/page.tsx:601-622`：页面级 `handleTouchEnd` 监听水平滑动（80px 阈值）切换 diary ↔ todo tab
- `features/todos/components/calendar-strip.tsx:56-73`：CalendarStrip 的 `handleTouchEnd` 监听水平滑动（50px 阈值）切换周
- 事件冒泡：CalendarStrip 处理完后事件继续冒泡到 `<main>` 的页面级 handler
- 页面级 handler 有 `swipeable-task-item` 的豁免检查（line 605），但没有 `calendar-strip` 的豁免

## 修复方案

在 `app/page.tsx` 的 `handleTouchEnd` 中，扩展手势豁免检查，增加对 `calendar-strip` 和 `calendar-expand` 的跳过：

```typescript
// 如果手势发生在日历区域或可侧滑的待办项内，跳过全局手势
const target = e.target as HTMLElement;
if (
  target.closest?.("[data-testid='swipeable-task-item']") ||
  target.closest?.("[data-testid='calendar-strip']") ||
  target.closest?.("[data-testid='calendar-expand']")
) return;
```

这与现有的 `swipeable-task-item` 豁免模式一致，不引入新的手势协调机制。不使用 `stopPropagation`，因为 closest 模式更温和（不阻止其他全局 touch 监听）。

**DOM 结构说明**：收起态时 DOM 中只有 `data-testid="calendar-strip"`（CalendarExpand 直接返回 CalendarStrip），展开态时 DOM 中有 `data-testid="calendar-expand"` 但不含 `calendar-strip`。两个 testid 分别覆盖两种状态，互不重叠。

## 1. 手势豁免

### 场景 1.1: 日历条滑动不触发 tab 切换
```
假设 (Given)  用户在待办页的时间视图
当   (When)   用户在日历条区域左右滑动超过 80px
那么 (Then)   只切换日历的周，不触发 tab 切换
并且 (And)    用户仍停留在待办页
```

### 场景 1.2: 日历展开视图滑动不触发 tab 切换
```
假设 (Given)  用户展开了完整月历视图
当   (When)   用户在月历区域左右滑动
那么 (Then)   不触发 tab 切换
并且 (And)    用户仍停留在待办页
```

### 场景 1.3: 非日历区域滑动正常切换 tab
```
假设 (Given)  用户在待办页
当   (When)   用户在日历条/月历以外的区域左右滑动超过 80px
那么 (Then)   正常触发 tab 切换（左滑→日记，右滑→待办）
```

## 验收行为（E2E 锚点）

### 行为 1: 日历滑动独立于 tab 切换
1. 用户打开待办页
2. 用户在日历条区域向左滑动
3. 日历显示下一周的日期
4. 用户仍停留在待办页（tab 未切换）

### 行为 2: 其他区域 tab 切换正常
1. 用户在待办页
2. 用户在任务列表下方空白区域向右滑动
3. 页面切换到日记页

## 边界条件
- [x] 日历条上短距离滑动（< 50px）：两个 handler 都不触发，无冲突
- [x] 50px < |dx| < 80px 区间：CalendarStrip 触发周切换，page.tsx 不触发 tab 切换（阈值 80px），无冲突
- [x] 展开月历后水平滑动：被 `calendar-expand` 的 data-testid 豁免，不触发 tab 切换
- [x] 展开月历后垂直滑动（上拉收起）：CalendarExpand 只处理垂直手势，page.tsx 也忽略垂直为主的手势，无冲突
- [x] 待办项侧滑：已有豁免逻辑，不受影响

## 回归影响
- 改动仅在 `app/page.tsx` 的 `handleTouchEnd` 中增加 closest 检查
- 不影响其他手势行为（待办项侧滑、侧边栏打开等）
