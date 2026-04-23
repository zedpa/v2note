---
id: "fix-tag-limit"
title: "Fix: 标签系统清理 — 删除系统标签 + 限制每条记录至多5个"
status: completed
backport: record-hierarchy-tags.md
domain: cognitive
risk: medium
dependencies: []
superseded_by: null
created: 2026-04-06
updated: 2026-04-06
---

# Fix: 标签系统清理 — 删除系统标签 + 限制每条记录至多5个

## 概述
当前标签系统存在两个问题：
1. 系统标签（待办/灵感/复盘）已废弃，但代码仍硬编码存在
2. AI 提取标签无数量限制，当设备无已有标签时 AI 自由生成，导致单条记录 20+ 标签（如截图所示）

标签来源应为：文件夹路径(domain) + AI 主题总结（至多5个）

## 1. 删除系统标签

### 场景 1.1: 移除 SYSTEM_TAGS 硬编码
```
假设 (Given)  代码中存在 SYSTEM_TAGS = ["待办", "灵感", "复盘"]
当   (When)   清理完成
那么 (Then)   SYSTEM_TAGS 常量删除
并且 (And)    useTags hook 不再引用 SYSTEM_TAGS
并且 (And)    getAvailableTags 只返回自定义标签
```

## 2. 限制 AI 提取标签数量 (process_audio)

### 场景 2.1: AI prompt 中明确限制
```
假设 (Given)  AI 正在分析录音/文本
当   (When)   生成标签
那么 (Then)   prompt 中要求"最多选择5个最相关的标签"
```

### 场景 2.2: 代码层硬限制
```
假设 (Given)  AI 返回了超过5个标签
当   (When)   解析 AI 返回结果
那么 (Then)   截断为前5个：filteredTags.slice(0, 5)
```

### 场景 2.3: 无可用标签时仍受限
```
假设 (Given)  设备没有已有标签（availableTags 为空）
当   (When)   AI 自由生成标签
那么 (Then)   最多保留5个
```

## 3. 前端标签编辑限制

### 场景 3.1: 新建笔记 — 已选5个标签时禁止继续选择
```
假设 (Given)  用户正在新建笔记，已选择5个标签
当   (When)   用户点击未选中的标签
那么 (Then)   标签不被选中
并且 (And)    未选中的标签显示为禁用态
```

### 场景 3.2: 记录详情 — 已有5个标签时隐藏输入框
```
假设 (Given)  记录已有5个标签
当   (When)   用户查看记录详情
那么 (Then)   不显示 "+ 标签" 输入框
```

### 场景 3.3: 移除标签后恢复标签输入框
```
假设 (Given)  记录有5个标签，标签输入框被隐藏
当   (When)   用户点击移除一个标签
那么 (Then)   标签数变为4，输入框重新出现
```

## 4. 后端 API 校验

### 场景 4.1: 超限时拒绝添加
```
假设 (Given)  记录已有5个标签
当   (When)   调用 POST /api/v1/records/:id/tags
那么 (Then)   返回 400，body 包含 error 消息
并且 (And)    不新增标签
```

## 修改清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `features/tags/lib/tag-manager.ts` | 删除 SYSTEM_TAGS，新增 MAX_TAGS_PER_RECORD = 5 |
| 2 | `features/tags/hooks/use-tags.ts` | 移除 SYSTEM_TAGS 引用，isSystemTag 移除 |
| 3 | `features/notes/components/text-editor.tsx` | toggleTag 检查上限，超限禁用未选标签 |
| 4 | `features/notes/components/note-detail.tsx` | tags >= 5 时隐藏输入框 |
| 5 | `supabase/functions/process_audio/index.ts` | prompt 加"最多5个" + filteredTags.slice(0, 5) |
| 6 | `gateway/src/routes/tags.ts` | addToRecord 前检查数量，超限返回 400 |
| 7 | `gateway/src/db/repositories/tag.ts` | 新增 countByRecordId |
