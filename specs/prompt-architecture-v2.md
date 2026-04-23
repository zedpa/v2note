---
id: "123"
title: "提示词架构 v2 — SharedAgent / UserAgent 分层 + 存储边界重定义（已拆分）"
status: superseded
domain: agent
risk: high
superseded_by: ["prompt-architecture-v2-layers.md", "prompt-architecture-v2-skills.md"]
dependencies: ["cognitive-wiki.md", "chat-system.md", "agent-tool-layer.md"]
created: 2026-04-10
updated: 2026-04-17
---

# 提示词架构 v2（已拆分）

> ⚠️ 本文件已于 2026-04-17 拆分为两个子域 spec（原文件 890 行，超过 800 行阻断阈值）。
> **请不要在本文件上继续追加内容。**

## 拆分后的子文件

| 子域文件 | 内容范围 |
|---------|---------|
| [`prompt-architecture-v2-layers.md`](./prompt-architecture-v2-layers.md) | 概述 + §1 SharedAgent + §2 UserAgent + §3 五层存储互斥边界 + §4 endChat 重构 |
| [`prompt-architecture-v2-skills.md`](./prompt-architecture-v2-skills.md) | §5 自我维护工具 + §5b Skill 重构 + §6 System Prompt 组装 + §7 Context Loader + §8 文件拆分 + 边界条件 + 接口约定 + 依赖 + Implementation Phases + 备注 |

## 场景编号对照

- 场景 1.x / 2.x / 3.x / 4.x → `prompt-architecture-v2-layers.md`
- 场景 5.x / 5b.x / 6.x / 7.x / 8.x → `prompt-architecture-v2-skills.md`

## 拆分理由

原文件 890 行，触发 spec-lint R7 规则（>800 行阻断）。按内容耦合度拆为：
- **layers** — 存储分层定义（架构骨架）
- **skills** — 工具、Skill 激活、组装顺序、实施阶段（具体实现）

两个子文件通过 `dependencies` 字段互相引用。
