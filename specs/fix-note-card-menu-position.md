---
id: fix-note-card-menu
title: Fix: 日记卡片三点菜单按钮被标签挤到第二行
status: completed
domain: ui
risk: low
created: 2026-04-09
---

# Fix: 日记卡片三点菜单按钮位置固定

## Bug 现象

日记卡片 meta 行（时间 · 时长 · 标签 ⋮）使用 `flex flex-wrap`。
当标签较多时（如 5 个标签），内容换行，三点菜单按钮（MoreVertical）被挤到第二行。

截图中第二张卡片（01:23）可见：标签 `工作 产品反馈 编辑框 UI 体验` 占满一行后，
⋮ 按钮出现在第二行左侧，而非固定在右上角。

## 修复方案

将 meta 行拆为两层：
- 外层: `flex items-start` — 左侧放 meta 信息 + 标签（可换行），右侧放菜单按钮（固定）
- 内层: `flex items-center flex-wrap` — 时间、时长、标签自由换行
- 菜单按钮: `shrink-0` 固定在外层右侧，不参与换行

## 场景

### 场景 1: 标签多时菜单位置固定
- Given 一条日记有 5+ 个标签
- When 渲染卡片
- Then ⋮ 按钮固定在 meta 行右上角，不随标签换行

### 场景 2: 标签少时布局不变
- Given 一条日记有 0-3 个标签
- When 渲染卡片
- Then 布局与当前一致，⋮ 在行末

## 影响文件
- `features/notes/components/notes-timeline.tsx` — meta 行 JSX 结构
