---
id: fix-tab-squeeze
title: "Fix: 顶部日记/待办切换 Tab 被挤压成竖排"
status: active
domain: ui
risk: low
created: 2026-04-12
---

# Fix: 顶部日记/待办切换 Tab 被挤压成竖排

## Bug 现象

在移动端，顶部 workspace header 的日记/待办 segment 切换器中，「待办」两个字被挤成竖排显示。切换后布局不对齐。

## 复现条件

- 移动端 390px 视口
- 顶部 header 中，左侧头像 + 中间 tab + 右侧按钮组(聊天+搜索)
- 中间 tablist 没有 `shrink-0`，在 flex `justify-between` 布局中被两侧 `shrink-0` 的元素挤压

## 根因分析

`workspace-header.tsx` 第 74 行，tablist 容器 `w-[160px]` 但缺少 `shrink-0`，flex 布局中可被压缩到小于 160px。当空间不足时，tab 按钮文字 "待办" 会被逐字换行。

同时 tab 按钮缺少 `whitespace-nowrap`，允许了文字换行。

## 修复方案

1. tablist 容器添加 `shrink-0` 防止被压缩
2. tab 按钮添加 `whitespace-nowrap` 防止文字换行

## 场景

### S1: Tab 文字不被挤压

- **Given** 移动端 390px 视口
- **When** 用户查看顶部 header 的 tab 切换器
- **Then** "日记" 和 "待办" 文字水平排列，不换行

### S2: 切换 Tab 后布局一致

- **Given** 当前在日记 tab
- **When** 切换到待办 tab
- **Then** 两个 tab 大小对称，文字居中，带 chevron 图标时也不换行

## 验收行为（E2E 锚点）

1. 在 390×844 视口打开首页
2. 检查 tablist 中所有 tab 按钮的文字不是竖排（高度 < 宽度）
3. 切换到待办 tab，确认文字正常水平显示
