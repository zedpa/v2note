---
id: fix-fab-over-todo-sheet
title: "Fix: 待办创建/编辑 Sheet 打开时 FAB 录音按钮仍悬浮"
status: active
domain: ui
risk: low
dependencies: ["todo-ui.md", "app-mobile-views.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Fix: 待办创建/编辑 Sheet 打开时 FAB 录音按钮仍悬浮

## 概述

用户在待办页点击"+"打开手动创建待办 Sheet 时，FAB 录音按钮仍然悬浮在 Sheet 上方，遮挡"添加任务"按钮区域。原因是 TodoCreateSheet 的 `createOpen` 状态在 TimeView/ProjectView 内部管理，未上报到 app/page.tsx 的 FAB visible 判断。

同理，TodoEditSheet 的 `editOpen` 在 TodoWorkspace 内部，也存在同样问题。

## 1. FAB 在 Sheet 打开时隐藏

### 场景 1.1: 打开创建 Sheet 时 FAB 隐藏
```
假设 (Given)  用户在待办页，FAB 可见
当   (When)   用户点击"+"打开创建待办 Sheet
那么 (Then)   FAB 立即隐藏（不参与渲染）
```

### 场景 1.2: 关闭创建 Sheet 时 FAB 恢复
```
假设 (Given)  创建 Sheet 已打开，FAB 已隐藏
当   (When)   用户关闭创建 Sheet（完成创建或取消）
那么 (Then)   FAB 恢复显示
```

### 场景 1.3: 编辑 Sheet 打开时 FAB 隐藏
```
假设 (Given)  用户在待办页，FAB 可见
当   (When)   用户点击某个待办打开编辑 Sheet
那么 (Then)   FAB 立即隐藏
```

### 场景 1.4: 项目视图创建 Sheet 同样隐藏 FAB
```
假设 (Given)  用户在待办项目视图，FAB 可见
当   (When)   用户点击添加按钮打开创建 Sheet
那么 (Then)   FAB 立即隐藏
```

## 修复方案

1. TodoWorkspace 新增 `onSheetOpenChange?: (open: boolean) => void` 回调
2. TimeView / ProjectView 新增同名回调，当 `createOpen` 变化时调用
3. TodoWorkspace 内部合并 `createOpen`（来自子视图）和 `editOpen`（自身），任一为 true 时上报 true
4. app/page.tsx 新增 `todoSheetOpen` 状态，传入 FAB 的 visible 条件

## 验收行为（E2E 锚点）

### 行为 1: 创建 Sheet 打开时 FAB 不可见
1. 用户进入待办页（时间视图）
2. 点击"+"按钮打开创建 Sheet
3. FAB 不在页面上可见
4. 关闭 Sheet 后 FAB 恢复

## 边界条件
- [x] 时间视图和项目视图都需处理
- [x] 编辑 Sheet 同样需要隐藏 FAB
- [x] 录音进行中时 FAB 不受 visible 控制（已有逻辑：`phase !== "idle"` 时不隐藏）
