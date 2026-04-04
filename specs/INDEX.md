# Spec Index

<!--
🤖 AI 必读指令：
1. 在处理任何功能请求前，必须先读取此文件
2. 按 domain 查找是否已有 active/draft 状态的 spec
3. 只关注 active 和 draft 状态的 spec，跳过 completed/superseded/deprecated
4. 如果找到匹配的 spec，在该文件中追加内容，不要新建
5. 如果需要了解已完成功能的历史实现细节，可以读取 completed 状态的 spec
6. superseded 状态的 spec 已被合并，永远不要引用它们，使用 superseded_by 指向的文件
-->

> 最后更新：2026-04-04 | 共 86 个 spec（18 active / 4 draft / 33 completed / 29 superseded / 2 deprecated）

## 🔵 Active（当前有效，可直接引用和修改）

| id | title | domain | file | 子域说明 |
|----|-------|--------|------|---------|
| 050a | Todo — Core & Logic | todo | todo-core.md | 数据流/AI提取/去重/时间/子任务/Strike关联 |
| 050b | Todo — UI & Interactions | todo | todo-ui.md | 界面交互 + 实施阶段 |
| 051 | Chat System | chat | chat-system.md | |
| 053b | Daily Report — Extended | report | daily-report-extended.md | 周月报/历史报告（Phase 2-4 未开始） |
| 062 | AI 伴侣窗口 | ui | ai-companion-window.md | |
| 064a | APP Mobile — Views | ui | app-mobile-views.md | 整体结构/顶栏/日记/待办/FAB |
| 064b | APP Mobile — Nav & System | ui | app-mobile-nav.md | 侧边栏/通知/参谋/冷启动/登录 |
| 065 | 附件持久化 + RAG | infra | attachment-persistence.md | |
| 071 | 并发扩容方案 | infra | concurrency-scaling.md | |
| 089 | 移动端行动面板 | ui | mobile-action-panel.md | |
| 092 | 留存分析 | onboarding | onboarding-retention-analytics.md | |
| 099 | 主题生命周期 | cognitive | topic-lifecycle.md | Harvest AI摘要生成待完成 |
| 102a | Voice Routing — Core | voice | voice-routing.md | Layer 3 regex预过滤待移除 |
| 102b | Voice — Todo Extension | voice | voice-todo-ext.md | 确认弹窗UI/提醒/周期未做 |
| 110 | UI/UX 全局审查与改进 | design | ui-ux-audit.md | 审查完毕,修复0% |

## 🟡 Draft（规划中，尚未开始实施）

| id | title | domain | file |
|----|-------|--------|------|
| 075 | 发现页 | ui | discovery-page.md |
| 080 | 外部数据源集成 | infra | external-integration.md |
| 087 | 鸿蒙适配 | infra | harmony-support.md |
| 094 | 阅读器 | ui | reader.md |

## ✅ Completed（已实现，仅供历史参考）

| id | title | domain | file |
|----|-------|--------|------|
| 052 | Cold Start & Onboarding | onboarding | cold-start.md |
| 053a | Daily Report — Core | report | daily-report-core.md |
| 054a | Auth — Token & Session | auth | auth-core.md |
| 054b | Auth — UX & Registration | auth | auth-ux.md |
| 055 | Schema 清理 + Embedding | infra | 042-schema-cleanup-and-embedding.md |
| 056 | 行动事件追踪 | cognitive | action-tracking.md |
| 057 | 参谋上下文 | chat | advisor-context.md |
| 058 | Agent Plan | agent | agent-plan.md |
| 059 | Agent 自适应 | agent | agent-self-evolution.md |
| 060 | Agent 工具层 | agent | agent-tool-layer.md |
| 061 | Agent 联网工具 | agent | agent-web-tools.md |
| 066 | Cluster 标签同步 | cognitive | cluster-tag-sync.md |
| 067 | 认知引擎 v2 | cognitive | cognitive-engine-v2.md |
| 068 | 认知快照 | cognitive | cognitive-snapshot.md |
| 069 | 认知结构修复 | cognitive | cognitive-structure-repair.md |
| 070 | 并发加固 | infra | concurrency-hardening.md |
| 073 | 设计对齐 | design | design-alignment.md |
| 074 | 视觉对齐 | design | design-visual-alignment.md |
| 076 | 领域词库 | cognitive | domain-vocabulary.md |
| 078 | 涌现全生命周期 | cognitive | emergence-lifecycle.md |
| 079 | 空状态引导 | design | empty-state-guide.md |
| 081 | Fix: Chat 无限加载 | chat | fix-chat-hang.md |
| 082 | Fix: 简报 500 | report | fix-daily-briefing-500.md |
| 083 | 目标自动关联 | goal | goal-auto-link.md |
| 084 | 目标粒度处理 | goal | goal-granularity.md |
| 085 | 目标全生命周期 | goal | goal-lifecycle.md |
| 086 | 目标骨架 | goal | goals-scaffold.md |
| 088 | 知识生命周期 | cognitive | knowledge-lifecycle.md |
| 090 | 移动端原生体感 | ui | mobile-native-feel.md |
| 091 | Prompt 重构 | agent | multi-agent-prompt-refactor.md |
| 093 | 人物画像 | cognitive | person-profile.md |
| 095 | Record 层级标签 | cognitive | record-hierarchy-tags.md |
| 096 | 侧边栏我的世界 | ui | sidebar-my-world.md |
| 097 | Source Type 权重 | cognitive | source-type-weight.md |
| 098 | Strike 提取 | cognitive | strike-extraction.md |
| 100 | 顶层维度 | goal | top-level-dimensions.md |
| 101 | 语音指令识别 | voice | voice-action.md |
| 103 | 语音控制 v2 | voice | voice-tools-v2.md |
| 111 | Fix: Voice→Todo 管线接通 | voice | fix-voice-todo-pipeline.md |

## ⛔ Superseded（已被合并，不要引用）

29 个碎片/拆分前 spec 已被合并或拆分，详见各文件 frontmatter 的 `superseded_by` 字段。
包括：22 个原始碎片 + 5 个拆分前的域 spec（todo-system.md, auth.md, daily-report.md, app-mobile-redesign.md, voice-routing-v2.md）+ daily-review-redesign.md + chat-ui-redesign.md

## 🚫 Deprecated（已废弃）

| id | title | domain | file |
|----|-------|--------|------|
| 063 | 批注系统 | ui | annotation.md |
| 077 | 涌现链 L1→L2→L3 | cognitive | emergence-chain.md |
