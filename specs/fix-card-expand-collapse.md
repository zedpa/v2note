---
id: fix-card-expand-collapse
title: "Fix: 日记卡片展开逻辑优化+收起按钮高度"
status: completed
domain: ui
risk: low
dependencies: []
superseded_by: null
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 日记卡片展开逻辑优化+收起按钮高度

## 概述
日记卡片（notes-timeline.tsx）有两个 UI 问题：
1. 有附件但文字少的卡片，点击卡片body会触发无意义展开（展开后只有空白+收起按钮）
2. 展开后收起按钮区域占据过多高度，视觉不协调

## Bug 现象

### 问题 1: 无意义的卡片body展开
- 当前 `canExpand = isVoice || isFile || isImage || isClamped`
- 有附件但文字未被截断时，点击卡片body展开，但展开区只有收起按钮
- 用户期望：文字没被截断就不需要body展开，"原文"按钮已经独立处理展开

### 问题 2: 收起按钮区域过高
- 展开区域 `mt-3 pt-3 border-t space-y-3` + 收起按钮 `pt-1`
- 当没有 todos/related 时，整个区域只有收起按钮，但 spacing 让它看起来很高

## 修复方案

### 场景 1: 短文字+附件卡片不触发body展开
```
假设 (Given)  卡片有录音/附件，但文字未被 line-clamp 截断
当   (When)   用户点击卡片body区域（非"原文"按钮区域）
那么 (Then)   不触发展开
并且 (And)    点击"原文"按钮仍然正常展开+显示原文
```

### 场景 2: 长文字卡片保持原有展开行为
```
假设 (Given)  卡片文字被 line-clamp 截断（isClamped === true）
当   (When)   用户点击卡片body区域
那么 (Then)   正常展开显示全文
```

### 场景 3: 收起按钮区域紧凑化
```
假设 (Given)  卡片已展开
当   (When)   展开区域没有 todos/related 等详情内容
那么 (Then)   收起按钮紧贴内容，不留大段空白
并且 (And)    收起按钮高度适配文字行高
```

## 验收行为（E2E 锚点）

### 行为 1: 短文字录音卡片
1. 有一条录音记录，文字只有一行
2. 点击卡片body → 无反应
3. 点击"原文 >" → 展开原文面板 + 卡片展开
4. 收起按钮紧贴内容显示

## 边界条件
- [x] 纯文字长卡片（无附件）仍然可以点击展开
- [x] 有附件且文字也很长的卡片，body点击仍可展开

## 影响范围
- `features/notes/components/notes-timeline.tsx`

## 实施计划
- [x] Phase 1: 修改 canExpand 逻辑，只保留 isClamped
- [x] Phase 2: 缩减收起按钮区域的 spacing
