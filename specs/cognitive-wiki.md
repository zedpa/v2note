---
id: "119"
title: "认知 Wiki — 从原子拆解到知识编译"
status: superseded
domain: cognitive
risk: high
dependencies: ["todo-core.md", "topic-lifecycle.md"]
superseded_by: ["cognitive-wiki-core.md", "cognitive-wiki-lifecycle.md", "cognitive-wiki-migration.md"]
created: 2026-04-08
updated: 2026-04-17
---

# 认知 Wiki — 从原子拆解到知识编译（已拆分）

> 本文件已按子域拆分为 3 个子文件（原文件 1568 行超过 R7 阈值 800）。
> 不再维护本文件内容，所有编辑请进入下面的子文件。

## 拆分后文件

- **`cognitive-wiki-core.md`** — 概述 + 数据模型（§1）+ 实时 Ingest（§2）+ 每日编译（§3）
- **`cognitive-wiki-lifecycle.md`** — 搜索（§4）+ 知识热力与生命周期（§4b）+ 前端适配（§5）+ 迁移策略（§6）+ 验收行为（E2E 锚点）+ 边界条件
- **`cognitive-wiki-migration.md`** — 依赖 + 接口约定 + 砍掉的模块 + Implementation Phases（Batch 1-4，含 Batch 3 Strike 退役 + Batch 4 统一 Page 模型）+ 备注

## 拆分理由

- 原文件 1568 行，远超 SDD 流程 R7 规则的 800 行阻断阈值
- 3 个子文件聚焦不同关注点：核心模型 / 前端体验 / 基础设施迁移
- 按 Phase 1 拆分规则：子文件在 INDEX.md 中各自登记，原文件标记 `superseded`
