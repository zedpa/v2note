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

> 最后更新：2026-04-20 | 共 112 个 spec（21 active / 5 draft / 53 completed / 31 superseded / 2 deprecated）

## 🔵 Active（当前有效，可直接引用和修改）

| id | title | domain | file | 子域说明 |
|----|-------|--------|------|---------|

| 050a | Todo — Core & Logic | todo | todo-core.md | 数据流/AI提取/去重/时间/子任务/Strike关联 |
| 050b | Todo — UI & Interactions | todo | todo-ui.md | 界面交互 + 实施阶段 |
| 051 | Chat System | chat | chat-system.md | Header/Entry/Greeting/Skill |
| 053b | Daily Report — Extended | report | daily-report-extended.md | 周月报/历史报告（Phase 2-4 未开始） |
| 062 | AI 伴侣窗口 | ui | ai-companion-window.md | |
| 064a-d | APP Mobile — Diary | app-mobile | app-mobile-views-diary.md | 整体结构/顶栏/日记/下拉刷新 |
| 064a-t | APP Mobile — Todo & FAB | app-mobile | app-mobile-views-todo.md | 待办视图/FAB 录音按钮 |
| 064b | APP Mobile — Nav & System | ui | app-mobile-nav.md | 侧边栏/通知/参谋/冷启动/登录 |
| 065 | 附件持久化 + RAG | infra | attachment-persistence.md | Phase 1 ✅ 已实现；Phase 2 文档分块 RAG 待开发 |
| 071 | 并发扩容方案 | infra | concurrency-scaling.md | |
| 092 | 留存分析 | onboarding | onboarding-retention-analytics.md | |
| 099 | 主题生命周期 | cognitive | topic-lifecycle.md | Harvest AI摘要生成待完成 |
| cognitive-wiki-core | 认知 Wiki — 核心模型与编译管线 | cognitive | cognitive-wiki-core.md | 概述/数据模型/实时 Ingest/每日编译（拆自 cognitive-wiki.md） |
| cognitive-wiki-lifecycle | 认知 Wiki — 搜索、热力与前端适配 | cognitive | cognitive-wiki-lifecycle.md | 搜索/热力/前端适配/迁移/验收行为/边界（拆自 cognitive-wiki.md） |
| cognitive-wiki-migration | 认知 Wiki — 依赖、接口与实施阶段 | cognitive | cognitive-wiki-migration.md | 依赖/接口/砍掉模块/Batch 1-4 Phases/备注（拆自 cognitive-wiki.md） |
| 102a | Voice Routing — Core | voice | voice-routing.md | Layer 3 regex预过滤待移除 |
| 102b | Voice — Todo Extension | voice | voice-todo-ext.md | 确认弹窗UI/提醒/周期未做 |
| 110 | UI/UX 全局审查与改进 | design | ui-ux-audit.md | 审查完毕,修复0% |
| 112 | Recording Resilience — 录音防丢 | voice | recording-resilience.md | 本地缓存+断线重试+连接保护 |
| 114 | 录音入口统一 | voice | voice-input-unify.md | 删InputBar死代码 + ChatView接gateway ASR + useVoiceToText hook |
| 117 | 工具生态增强 | agent | tool-ecosystem-enhance.md | 读取工具+时间感知+认知层查询+描述优化 |
| 120 | 原生体验深度优化 — 路线A | ui | native-experience-deep.md | Phase 0-D 分阶段 |
| 123a | 提示词架构 v2 — 分层（SharedAgent/UserAgent/五层存储/endChat） | agent | prompt-architecture-v2-layers.md | 拆分自 prompt-architecture-v2.md（§1-§4） |
| 123b | 提示词架构 v2 — 工具/Skill/组装/实施 | agent | prompt-architecture-v2-skills.md | 拆分自 prompt-architecture-v2.md（§5-§8 + 接口/Phases） |
| 125 | 待办写入系统日历 & 闹钟 | todo | todo-calendar-alarm.md | Intent方案+SystemIntentPlugin |
| 087 | 鸿蒙 HarmonyOS NEXT 适配 | infra | harmony-support.md | WebView壳+JSBridge+前端适配层 |
| PROC-001 | SDD 流程守卫（Hook + Lint） | infra | process-sdd-guardrails.md | A/C/B/D 已完成 |
| fix-sidebar-wiki-mgmt | Fix: 侧边栏 Wiki 页面管理 | ui | fix-sidebar-wiki-mgmt.md | Phase1-4✅+Phase5显示优化✅ |
## 🟡 Draft（规划中，尚未开始实施）

| id | title | domain | file |
|----|-------|--------|------|
| 130 | Desktop Canvas Shell — Foundation | ui | desktop-foundation.md |
| 124 | Android App Shortcuts — 长按快捷指令 | ui | android-app-shortcuts.md |
| 075 | 发现页 | ui | discovery-page.md |
| 080 | 外部数据源集成 | infra | external-integration.md |
| 094 | 阅读器 | ui | reader.md |

## ✅ Completed（已实现，仅供历史参考）

| id | title | domain | file |
|----|-------|--------|------|
| todo-ui-redesign-spec | Todo UI 重构 — 设计规范 | todo | todo-ui-redesign-spec.md |
| todo-ui-redesign-scenarios | Todo UI 重构 — 场景与实施 | todo | todo-ui-redesign-scenarios.md |
| 089 | 移动端行动面板 | ui | mobile-action-panel.md |
| fix-device-id-cleanup | Fix: deviceId 残留清理 — 路由层全面切 userId | infra | fix-device-id-cleanup.md |
| fix-todo-anytime-time | Fix: 随时时段创建待办被自动赋予时间 | todo | fix-todo-anytime-time.md |
| fix-evening-report-quality | Fix: 晚间总结路径统一+明日预览数据错误 | report | fix-evening-report-quality.md |
| fix-cold-resume-silent-loss | Fix: 本地优先捕获 — 录音/日记发送不依赖网络与鉴权 | infra | fix-cold-resume-silent-loss.md |
| fix-cold-resume-lazy-bind | Fix: 冷启动懒绑定生命周期补完 | infra | fix-cold-resume-lazy-bind.md |
| fix-onboarding-old-account | Fix: 老账户误触发新手引导 | onboarding | fix-onboarding-old-account.md |
| fix-goal-stale-cleanup | Fix: 历史低质量目标清理 + 自动化维护 | cognitive | fix-goal-stale-cleanup.md |
| fix-oss-image-traffic-storm | Fix: OSS 图片流量风暴（签名缓存 + 本地图片缓存 + 僵尸清扫 + 轮询上限） | infra | fix-oss-image-traffic-storm.md |
| fix-domain-deprecation | Fix: domain 字段全面废弃 | infra | fix-domain-deprecation.md |
| fix-goal-wiki-data-cleanup | Fix: Goal/Wiki Page 数据清洗 | cognitive | fix-goal-wiki-data-cleanup.md |
| repo-transaction-support | Repo 层事务支持 — 消除 raw SQL 绕过 repo | infra | repo-transaction-support.md |
| fix-process-domain-to-page | Fix: Layer 3 domain → page_title 即时归类 | cognitive | fix-process-domain-to-page.md |
| fix-goal-quality | Fix: goal_sync 目标去重 + 层级组织 | cognitive | fix-goal-quality.md |
| fix-recording-audio-focus | Fix: 录音按钮无法中断系统音频播放 | voice | fix-recording-audio-focus.md |
| fix-onboarding-step2-guide | Fix: 冷启动第二步改为聚焦操作引导 | onboarding | fix-onboarding-step2-guide.md |
| fix-remove-device-id | Fix: 全面清除 deviceId 概念 | infra | fix-remove-device-id.md |
| fix-record-delete-strike | Fix: 删除日记报错 strike 表不存在 | infra | fix-record-delete-strike.md |
| fix-briefing-stale-todos | Fix: 早晚报待办过时+数据范围修正 | report | fix-briefing-stale-todos.md |
| fix-command-sheet-stuck | Fix: 上滑指令 CommandSheet 堵塞 | voice | fix-command-sheet-stuck.md |
| fix-recording-notify-stale | Fix: 录音处理通知状态滞后 | voice | fix-recording-notify-stale.md |
| fix-recording-hint-style | Fix: 录音模式方向提示改为小按钮样式 | voice | fix-recording-hint-style.md |
| fix-card-expand-collapse | Fix: 日记卡片展开逻辑优化+收起按钮高度 | ui | fix-card-expand-collapse.md |
| 122 | 日程提醒 — 本地通知调度 | todo | todo-reminder-notify.md |
| fix-record-delete-ghost | Fix: 日记删除后幽灵 Strike 残留 | cognitive | fix-record-delete-ghost.md |
| 121 | 录音音频会话管理 | voice | audio-session-recording.md |
| fix-note-card-menu | Fix: 日记卡片三点菜单位置 | ui | fix-note-card-menu-position.md |
| fix-tag-limit | Fix: 标签系统清理 — 删除系统标签+限制5个 | cognitive | fix-tag-limit.md |
| fix-tag-overflow | Fix: AI 标签超限+strike_tag弃用 | cognitive | fix-tag-overflow.md |
| 118 | Chat Persistence — 对话持久化 | chat | chat-persistence.md |
| 052 | Cold Start & Onboarding | onboarding | cold-start.md |
| 053a | Daily Report — Core | report | daily-report-core.md |
| 054a | Auth — Token & Session | auth | auth-core.md |
| auth-ux-login | Auth — UX (登录/注册/Device ID/注册安全) | auth | auth-ux-login.md |
| auth-ux-settings | Auth — UX (邮箱/用户设置/忘记密码/实施阶段) | auth | auth-ux-settings.md |
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
| 113 | 键盘弹出 & Viewport 适配 | ui | keyboard-viewport-adapt.md |
| 115 | 产品重新定位 — 核心体验精简 | ui | product-repositioning.md |
| 116 | Chat 工具调用 UI 重构 | chat | chat-tool-ui.md |
| fix-rec-ui | Fix: 录音 UI 精简 | voice | fix-recording-ui.md |
| fix-chat-intent | Fix: 复合日记意图误判为查询指令 | agent | fix-chat-intent.md |
| fix-ai-memory-time | Fix: AI 记忆时间错乱 | cognitive | fix-ai-memory-time.md |
| fix-agent-tool-behavior | Fix: AI 工具调用异常 | agent | fix-agent-tool-behavior.md |
| fix-daily-report-notify | Fix: 早报通知未持久化+重复发送 | report | fix-daily-report-notify.md |
| fix-morning-briefing | Fix: 早报时区错位+问候语风格 | report | fix-morning-briefing.md |
| fix-calendar-swipe | Fix: 日历滑动与Tab切换手势冲突 | ui | fix-calendar-swipe-conflict.md |
| fix-tz | Fix: 系统性时区问题 | infra | fix-timezone-systematic.md |
| fix-todo-time-shift | Fix: 待办时间编辑时区偏移 | todo | fix-todo-time-shift.md |
| fix-note-card-edit-image | Fix: 卡片编辑自适应+图片缩略图 | ui | fix-note-card-edit-image.md |
| fix-todo-project-vanish | Fix: 待办项目视图添加后消失 | todo | fix-todo-project-vanish.md |
| fix-image-thumbnail | Fix: 图片插入后显示文字描述而非缩略图 | ui | fix-image-thumbnail.md |
| fix-briefing-prompt-v2 | Fix: 早晚报接入 v2 提示词架构 | report | fix-briefing-prompt-v2.md |
| fix-reminder-not-working | Fix: 提醒功能未生效 — Agent工具+编辑页+recalc | todo | fix-reminder-not-working.md |

## ⛔ Superseded（已被合并，不要引用）

30 个碎片/拆分前 spec 已被合并或拆分，详见各文件 frontmatter 的 `superseded_by` 字段。
包括：22 个原始碎片 + 6 个拆分前的域 spec（todo-system.md, auth.md, daily-report.md, app-mobile-redesign.md, voice-routing-v2.md, prompt-architecture-v2.md）+ daily-review-redesign.md + chat-ui-redesign.md + auth-ux.md（已拆为 auth-ux-login + auth-ux-settings）

## 🚫 Deprecated（已废弃）

| id | title | domain | file |
|----|-------|--------|------|
| 063 | 批注系统 | ui | annotation.md |
| 077 | 涌现链 L1→L2→L3 | cognitive | emergence-chain.md |
