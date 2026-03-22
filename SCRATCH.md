# SCRATCH.md — 执行上下文备份

## 当前阶段
PC 端 Phase A-D 全部完成（18/18 任务）

## Claude Code CLI 使用经验
- exit code 1 ≠ 任务失败——Claude Code 已知 bug（sandbox cwd tracking 副作用）
- 正确判断：看输出内容 + 检查目标文件 + 跑 tsc，不依赖 exit code
- 不用 `| Out-String` 管道，直接 `2>&1`
- prompt 用英文更稳定
- 极简 prompt 先创建骨架再扩展
- 参考 GitHub issues: anthropics/claude-code #36507 #36071 #37236

## 任务总览
| ID | 任务 | 复杂度 | 前置 | 状态 |
|----|------|--------|------|------|
| CE-01 | DB Migration 认知层表 | M | - | ✅ DONE |
| CE-02 | Digest Level 1 核心管道 | L | CE-01 | ✅ DONE |
| CE-03 | 混合检索模块 | M | CE-01 | ✅ DONE |
| CE-04 | Process → Digest 触发 | S | CE-02 | ✅ DONE |
| CE-05 | 3h Cron 批量 Digest | S | CE-02 | ✅ DONE |
| CE-06 | 前端 Strike 展示+纠错 | M | CE-02 | ✅ DONE |

## 关键设计决策
- Strike = 一次认知触动（不是 atom/note/memory）
- 极性（polarity）是一级字段，不是 tag
- 场（field）用 JSONB 预留
- Bond type 用软建议列表，允许 AI 自创
- 生命周期：active → superseded → archived
- Promote：Level 2 主动提升 cluster 为一等 Strike
- 混合检索三通道：embedding + 结构化 + cluster（Phase 2）
- 质量回路：前端轻量展示 + 纠错入口

## 核心文件位置
- 设计文档：docs/PLAN-cognitive-engine.md
- 任务卡片：ACTIVE_TASKS.md
- 现有 Process：gateway/src/handlers/process.ts
- 现有 Memory：gateway/src/memory/manager.ts
- 现有 Embedding：gateway/src/memory/embeddings.ts
- 现有 Context Loader：gateway/src/context/loader.ts
- 现有 Proactive Engine：gateway/src/proactive/（cron 注册处）
