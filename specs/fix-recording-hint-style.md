---
id: fix-recording-hint-style
title: "Fix: 录音模式方向提示改为小按钮样式"
status: completed
domain: voice
risk: low
dependencies: []
superseded_by: null
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 录音模式方向提示改为小按钮样式

## 概述
录音模式下三个方向提示（取消/常驻/指令）的文字太暗（`text-white/30` + opacity `0.35`），用户难以看清。改为小按钮样式（参考底部「松开发送」的 pill 按钮风格），拖动到对应方向后复用现有动画效果。

## Bug 现象
- 三个方向提示的默认状态：图标 `text-white/40`，文字 `text-white/30`，整体 opacity `0.35`
- 对比底部「松开发送」按钮（`bg-white/10 border border-white/10 text-white/70`），方向提示几乎看不见

## 修复方案

### 场景 1: 默认状态提示可见性
```
假设 (Given)  用户长按 FAB 进入录音模式
当   (When)   手指未向任何方向滑动（activeDirection === "none"）
那么 (Then)   三个方向提示以小按钮/pill 样式显示，包含背景色、边框、图标+文字横排
并且 (And)    默认 opacity 提升至可清晰辨认（≥ 0.6）
并且 (And)    文字颜色提升至 text-white/70 级别
```

### 场景 2: 拖动激活效果保持不变
```
假设 (Given)  用户正在录音模式
当   (When)   手指向某个方向滑动（activeDirection !== "none"）
那么 (Then)   被激活方向的按钮保持现有的放大 + 变色 + 发光效果
并且 (And)    非激活方向的按钮变暗（保持现有 opacity 递减逻辑）
```

### 场景 3: 布局结构变化
```
假设 (Given)  修改提示样式
当   (When)   将图标+文字从纵向排列改为横向 pill 按钮
那么 (Then)   图标在左，文字在右，整体为圆角 pill 形状
并且 (And)    背景为 bg-white/10 + backdrop-blur + border border-white/10（与「松开发送」风格一致）
```

## 验收行为（E2E 锚点）

> 纯 UI 样式变更，无功能逻辑改变。E2E 验收基于视觉检查。

### 行为 1: 录音模式下方向提示可见
1. 用户长按 FAB 进入录音模式
2. 三个方向提示（取消/常驻/指令）以 pill 按钮样式清晰显示
3. 拖动到某个方向时，该方向按钮高亮放大，其他变暗

## 边界条件
- [x] 三个方向按钮在不同屏幕尺寸下不互相遮挡
- [x] 激活态动画效果与现有行为一致（放大、变色、发光）

## 影响范围
- `features/recording/components/fab.tsx` — 三个方向提示的 JSX 和样式

## 实施计划
- [x] Phase 1: 修改三个方向提示的默认样式为 pill 按钮（横排图标+文字，背景+边框）
- [x] Phase 2: 调整激活态样式，保持现有动画效果

## 备注
- 这是纯样式修改，risk: low
- 参考对象：底部「松开发送」按钮的 pill 样式
