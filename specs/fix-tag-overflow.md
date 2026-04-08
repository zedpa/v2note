---
id: "fix-tag-overflow"
title: "Fix: AI 生成标签数超过5个限制 + strike_tag 弃用"
status: completed
domain: cognitive
risk: low
dependencies: ["fix-tag-limit"]
created: 2026-04-08
updated: 2026-04-08
---

# Fix: AI 生成标签数超过5个限制 + strike_tag 弃用

## 概述
fix-tag-limit 完成后，API 层（routes/tags.ts）和前端已有 5 个限制，但 gateway 内部 AI 标签写入路径遗漏了限制。
同时 strike_tag 回填已弃用，停止给 strike 打标签。

## 已修复

### 1. unified-process prompt 硬限 5
- prompt "2-4个" → "最多5个" + "硬性上限：tags 数组最多5个元素"

### 2. process.ts 写入前截断
- `parsed.tags.slice(0, 5)` 硬截断

### 3. strike_tag 弃用
- digest-prompt.ts：移除 strike 的 tags 字段定义和示例
- digest.ts：移除 strikeTagRepo 调用和 s.tags→record_tag 写入（死代码清理）
- batch-analyze.ts：移除 strikeTagRepo.createMany 调用

### 4. batch-analyze record_tag 传播限制
- cluster→record_tag 传播前检查 countByRecordId ≥ 5 则跳过

## 改动文件

| # | 文件 | 改动 |
|---|------|------|
| 1 | `gateway/src/handlers/unified-process-prompt.ts` | prompt 加"最多5个"硬限 |
| 2 | `gateway/src/handlers/process.ts` | `parsed.tags.slice(0, 5)` |
| 3 | `gateway/src/handlers/digest-prompt.ts` | 移除 strike tags 字段 |
| 4 | `gateway/src/handlers/digest.ts` | 移除 strikeTagRepo/tagRepo，清理死代码 |
| 5 | `gateway/src/cognitive/batch-analyze.ts` | 移除 strikeTagRepo，传播加 count 检查 |
