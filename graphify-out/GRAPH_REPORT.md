# Graph Report - E:/AI/workspace-coding/v2note/specs  (2026-04-14)

## Corpus Check
- 153 files · ~140,111 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 477 nodes · 515 edges · 55 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Tag & Todo Bug Fixes|Tag & Todo Bug Fixes]]
- [[_COMMUNITY_Cognitive Engine v2|Cognitive Engine v2]]
- [[_COMMUNITY_Design Alignment|Design Alignment]]
- [[_COMMUNITY_Domain Deprecation & Goal Quality|Domain Deprecation & Goal Quality]]
- [[_COMMUNITY_Mobile Companion & Navigation|Mobile Companion & Navigation]]
- [[_COMMUNITY_Voice & UX Audit|Voice & UX Audit]]
- [[_COMMUNITY_Agent Plan & Evolution|Agent Plan & Evolution]]
- [[_COMMUNITY_Chat Persistence & Context|Chat Persistence & Context]]
- [[_COMMUNITY_Schema & Embedding Pipeline|Schema & Embedding Pipeline]]
- [[_COMMUNITY_Todo Core System|Todo Core System]]
- [[_COMMUNITY_Keyboard & Native Feel|Keyboard & Native Feel]]
- [[_COMMUNITY_Hierarchy Tags & Source Weight|Hierarchy Tags & Source Weight]]
- [[_COMMUNITY_Archive & Top-Level Dimensions|Archive & Top-Level Dimensions]]
- [[_COMMUNITY_Multi-Agent Prompts & Profile|Multi-Agent Prompts & Profile]]
- [[_COMMUNITY_Briefing & Report Fixes|Briefing & Report Fixes]]
- [[_COMMUNITY_Daily Report Core|Daily Report Core]]
- [[_COMMUNITY_Agent Tool Behavior & AI Memory|Agent Tool Behavior & AI Memory]]
- [[_COMMUNITY_Recording UI & Audio|Recording UI & Audio]]
- [[_COMMUNITY_Session Recording & Buglog|Session Recording & Buglog]]
- [[_COMMUNITY_Device ID Migration|Device ID Migration]]
- [[_COMMUNITY_Image & Note Card Fixes|Image & Note Card Fixes]]
- [[_COMMUNITY_Chat Hang & Command Sheet|Chat Hang & Command Sheet]]
- [[_COMMUNITY_Sidebar My World|Sidebar My World]]
- [[_COMMUNITY_Domain Vocabulary|Domain Vocabulary]]
- [[_COMMUNITY_Record Delete Cascade|Record Delete Cascade]]
- [[_COMMUNITY_Device ID Removal|Device ID Removal]]
- [[_COMMUNITY_Calendar Alarm & Reminder|Calendar Alarm & Reminder]]
- [[_COMMUNITY_Action Tracking|Action Tracking]]
- [[_COMMUNITY_Empty State Guide|Empty State Guide]]
- [[_COMMUNITY_Morning Briefing Fix|Morning Briefing Fix]]
- [[_COMMUNITY_Onboarding Flow|Onboarding Flow]]
- [[_COMMUNITY_Reminder System Fix|Reminder System Fix]]
- [[_COMMUNITY_Reader & Daily Review|Reader & Daily Review]]
- [[_COMMUNITY_Recording Resilience|Recording Resilience]]
- [[_COMMUNITY_Repo Transaction Support|Repo Transaction Support]]
- [[_COMMUNITY_Tool Ecosystem Enhance|Tool Ecosystem Enhance]]
- [[_COMMUNITY_Daily Report Legacy|Daily Report Legacy]]
- [[_COMMUNITY_Chat Greeting Fix|Chat Greeting Fix]]
- [[_COMMUNITY_External Integration|External Integration]]
- [[_COMMUNITY_Chat Intent Routing|Chat Intent Routing]]
- [[_COMMUNITY_Tag Limit Rules|Tag Limit Rules]]
- [[_COMMUNITY_Auth Error Leak|Auth Error Leak]]
- [[_COMMUNITY_Calendar Swipe Fix|Calendar Swipe Fix]]
- [[_COMMUNITY_Card ExpandCollapse|Card Expand/Collapse]]
- [[_COMMUNITY_FAB Over Todo Sheet|FAB Over Todo Sheet]]
- [[_COMMUNITY_Note Card Menu Position|Note Card Menu Position]]
- [[_COMMUNITY_Tab Squeeze Fix|Tab Squeeze Fix]]
- [[_COMMUNITY_Contradiction & Decision|Contradiction & Decision]]
- [[_COMMUNITY_Cognitive Wiki|Cognitive Wiki]]
- [[_COMMUNITY_Date Format Alignment|Date Format Alignment]]
- [[_COMMUNITY_Auth Input Alignment|Auth Input Alignment]]
- [[_COMMUNITY_Chat Mic Alignment|Chat Mic Alignment]]
- [[_COMMUNITY_UI Polish Alignment|UI Polish Alignment]]
- [[_COMMUNITY_Mobile App Entry|Mobile App Entry]]
- [[_COMMUNITY_Spec Template|Spec Template]]

## God Nodes (most connected - your core abstractions)
1. `Spec Index — Master Catalog` - 21 edges
2. `Chat System Spec` - 10 edges
3. `Goal Full Lifecycle` - 10 edges
4. `Auth — Token & Session (054a)` - 9 edges
5. `Daily Report Core Spec` - 9 edges
6. `Fix: domain字段全面废弃` - 9 edges
7. `Native Experience Deep Optimization — Route A` - 9 edges
8. `Cognitive Engine v2 Spec` - 8 edges
9. `Fix: Goal/Wiki Page数据清洗` - 8 edges
10. `Agent Plan Mechanism (058)` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Chat Context Compression` --semantically_similar_to--> `Snapshot Size Control ≤5K tokens`  [INFERRED] [semantically similar]
  specs/chat-persistence.md → specs/cognitive-snapshot.md
- `Chat Instant Memory Trigger` --semantically_similar_to--> `AI Onboarding Conversation (5-Q)`  [INFERRED] [semantically similar]
  specs/chat-persistence.md → specs/cold-start.md
- `设计对齐 Phase 8 P1 Spec` --semantically_similar_to--> `设计语言对齐 Editorial Serenity 落地`  [INFERRED] [semantically similar]
  specs/design-alignment.md → specs/design-visual-alignment.md
- `Tinder-Style Swipe: Right=Complete, Left=Skip` --conceptually_related_to--> `Mobile Native Feel Optimization`  [INFERRED]
  specs/mobile-action-panel.md → specs/mobile-native-feel.md
- `语音转结构化待办 Spec (archived)` --semantically_similar_to--> `Voice Todo Extension提醒+周期+日历 Spec (ID 102b)`  [INFERRED] [semantically similar]
  specs/_archive/voice-to-todo.md → specs/voice-todo-ext.md

## Hyperedges (group relationships)
- **Agent Complex Task Execution Pipeline (Plan + Tools + State Machine)** — agent_plan, agent_tool_layer, agent_plan_state_machine [EXTRACTED 0.95]
- **Embedding Write → Store → pgvector Search Flow** — 042_embed_writer, 042_strike_embedding, 042_pgvector_retrieval [EXTRACTED 0.95]
- **Auth Token Lifecycle (Race Lock + Lifetime + Email Verification)** — auth_core_refresh_lock, auth_core_token_lifetime, auth_core_email_verification [EXTRACTED 0.90]
- **Cognitive Engine v2 Analysis Pipeline** — cognitive_engine_v2_tier1_digest, cognitive_engine_v2_tier2_batch, cognitive_snapshot_spec [EXTRACTED 0.95]
- **Chat Persistence & Context Management Flow** — chat_persistence_chat_message_table, chat_persistence_indexeddb_cache, chat_persistence_context_compression [EXTRACTED 0.90]
- **Cold Start User Journey to Value** — cold_start_ai_onboarding, cold_start_welcome_seeds, cold_start_early_bond_detection [EXTRACTED 0.92]
- **早晚报生成与推送管道（500修复+内容质量+通知去重）** — fix_daily_briefing_500_spec, fix_briefing_prompt_v2_spec, fix_daily_report_notify_spec [INFERRED 0.85]
- **Cluster 涌现完整生命周期（L1产出→L2涌现→L2生命周期管理）** — emergence_chain_spec, emergence_lifecycle_spec, design_alignment_cluster_prompt [INFERRED 0.80]
- **身份体系迁移链（device_id下线→DB约束→路由层清理）** — device_id_deprecation_spec, device_id_db_constraint_migration, fix_device_id_cleanup_spec [EXTRACTED 0.95]
- **Domain字段废弃迁移链(fix-sidebar→fix-process→fix-domain)** — fix_sidebar_wiki_mgmt_spec, fix_process_domain_to_page_spec, fix_domain_deprecation_spec [EXTRACTED 0.95]
- **Goal质量修复与数据清洗流水线** — fix_goal_quality_spec, fix_goal_wiki_cleanup_spec, fix_sidebar_wiki_topic_goal_section [INFERRED 0.85]
- **录音UX改进集群(UI+通知+音频焦点)** — fix_recording_ui_spec, fix_recording_notify_stale_spec, fix_recording_audio_focus_spec [INFERRED 0.80]
- **Timezone Fix Ecosystem: tz.ts + PG Timezone + Anti-patterns** — fix_tz_lib, fix_tz_pg_connection, fix_tz_toiso_antipattern, fix_todo_time_shift_z_strip [EXTRACTED 0.95]
- **Goal System Triad: Scaffold + Auto-Link + Full Lifecycle** — goals_scaffold_spec, goal_auto_link_spec, goal_lifecycle_spec [EXTRACTED 0.95]
- **Mobile Native Feel Stack: CSS Globals + Keyboard Viewport + Deep Animation** — mobile_native_feel_global_css, keyboard_viewport_css_vars, native_exp_deep_motion_tokens [INFERRED 0.82]
- **待办创建全链路 (Strike → 投影 → 去重 → 存储)** — strike_extraction_concept, todo_strike_bridge_intend_projection, todo_dedup_concept [INFERRED 0.85]
- **待办提醒系统 (本地通知 + 日历 + 闹钟)** — todo_reminder_notify_concept, todo_calendar_alarm_concept, todo_reminder_sync_on_launch [INFERRED 0.88]
- **录音防丢全链路 (本地缓存 + 队列 + 重试端点)** — recording_resilience_local_cache, recording_resilience_binary_queue, recording_resilience_retry_audio_endpoint [EXTRACTED 0.95]
- **语音路由完整管线 — 前端上下文+三层路由+工具执行** — voice_routing_source_context, voice_routing_three_layer, voice_action_intent_classifier [INFERRED 0.85]
- **主题生命周期飞轮 — Cluster涌现+Goal执行+Harvest反哺** — topic_lifecycle_flywheel, topic_lifecycle_harvest, archive_clustering [INFERRED 0.80]
- **认知矛盾决策链 — 矛盾检测+混合检索+决策工坊** — archive_contradiction_detection, archive_hybrid_retrieval, archive_decision_workshop [EXTRACTED 0.90]

## Communities

### Community 0 - "Tag & Todo Bug Fixes"
Cohesion: 0.06
Nodes (50): Fix: AI Tag Overflow + strike_tag Deprecation, strike_tag Table Deprecation, Tag Limit: Max 5 Tags Enforcement, Fix: Todo Project View Item Disappears, SQL Bug: parent_id IS NULL Excludes Project Tasks, parseScheduledTime() — Frontend Time Parse Fix, Fix: Todo Time Edit Timezone Shift, Anti-Pattern: Z Suffix Stripping Causes -8h Shift (+42 more)

### Community 1 - "Cognitive Engine v2"
Cohesion: 0.08
Nodes (31): Cluster Tag Sync Spec, Cluster→strike_tag Propagation, BatchAnalyzeOutput Schema, Rationale: Single-Call Batch vs Multi-Step Pipeline, Cognitive Engine v2 Spec, Tier1 Realtime Digest, Tier2 Batch Analysis, Snapshot Incremental Update (+23 more)

### Community 2 - "Design Alignment"
Cohesion: 0.08
Nodes (27): 聚类 Prompt 调优（cluster-prompt-tuning）, 认知统计重构（cognitive-stats-redesign）, 发现页 AI 洞察（discovery-insights）, 日记卡片 AI 分析（journal-card-insight）, 设计对齐 Phase 8 P1 Spec, 子任务前端 UI（todo-subtask-ui）, 设计语言对齐 Editorial Serenity 落地, Breath Principle（呼吸间距） (+19 more)

### Community 3 - "Domain Deprecation & Goal Quality"
Cohesion: 0.1
Nodes (25): at-route-parser domain写入清理, getDimensionSummary重写为wiki_page分组, lightweight-classifier domain写入清理, search工具domain过滤迁移到wiki_page, Fix: domain字段全面废弃, wiki-compiler domain逻辑清理, DB层goal去重防护兜底, goal_sync语义去重指令 (+17 more)

### Community 4 - "Mobile Companion & Navigation"
Cohesion: 0.11
Nodes (23): AI Mood System (mood → chat tone), Pixel Deer State Machine (system data mapped animation), AI Companion Window — Pixel Deer + Mood System (062), Android App Shortcuts — Long-Press Quick Actions (124), Capacitor appUrlOpen Event Handler, v2note:// Deep Link Scheme (Android Intent), APP Mobile Navigation & System Layer (064b), Advisor Chat Overlay (multi-mode: review/command/insight/decision) (+15 more)

### Community 5 - "Voice & UX Audit"
Cohesion: 0.1
Nodes (23): 统一输入API Spec (archived), 语音转结构化待办 Spec (archived), 无障碍规范 (ARIA/WCAG), UI/UX 全局审查与改进 Spec (ID 110), 触控目标规范 ≥44×44px, 确认机制 — 高风险操作气泡确认, 模糊匹配策略 — 关键词+分词+embedding, 意图分类器 — record/action/mixed三分类 (+15 more)

### Community 6 - "Agent Plan & Evolution"
Cohesion: 0.11
Nodes (21): fetch_url Tool (Readability + Ingest pipeline), Agent Plan Mechanism (058), Plan Card UI Component (confirm/modify/abandon), plan-executor.ts — Plan Execution Engine, Plan Partial Failure & Rollback Safety Valve, Chat Handler State Machine (IDLE/THINKING/EXECUTING_TOOL/AWAITING_CONFIRM), agent_plan DB Table (steps, status, rollback_info), Agent Self-Adaptation — Preference Learning & Soul Guard (059) (+13 more)

### Community 7 - "Chat Persistence & Context"
Cohesion: 0.11
Nodes (20): chat_message DB Table, Chat Context Compression, Chat Daily Diary Write, IndexedDB Chat Cache, Chat Instant Memory Trigger, Chat Persistence Spec, Global AI Processing Pipeline Store, Chat Conversation UI (+12 more)

### Community 8 - "Schema & Embedding Pipeline"
Cohesion: 0.15
Nodes (17): Domain CHECK Constraint (中文 domain 枚举), embed-writer.ts — Async Embedding Write Module, Goal Table → VIEW Migration, pgvector SQL Retrieval (O(logN) cosine query), Schema Cleanup & Embedding Persistence (042), Strike Embedding Column (vector 1024), todo_embedding / goal_embedding Tables, Advisor Context Merge (057) (+9 more)

### Community 9 - "Todo Core System"
Cohesion: 0.14
Nodes (16): Roadmap: Todo System (~85%), 智能待办 (superseded by todo-system), Todo 核心数据流 (字段映射修复), TodoDTO 完整字段定义, 待办去重 (dedupCreate embedding 0.65), cleanActionPrefix 清洗指令前缀, AI 提取质量修复 (模型升级+提示词重写), 月历展开/三色圆点 (+8 more)

### Community 10 - "Keyboard & Native Feel"
Cohesion: 0.19
Nodes (14): BottomFixed Component — Keyboard-Following Fixed Elements, Capacitor KeyboardResize: none Strategy, CSS Variables --app-height and --kb-offset, Keyboard Popup & Viewport Adaptation, Global CSS: tap-highlight/touch-callout/overscroll, useKeyboardOffset Hook — Bottom Sheet Keyboard Avoidance, select-none — Prevent Text Selection on Interactive Elements, Mobile Native Feel Optimization (+6 more)

### Community 11 - "Hierarchy Tags & Source Weight"
Cohesion: 0.15
Nodes (14): Record 层级标签, 层级标签与原子标签分离的理由, refreshHierarchyTags 函数, hierarchy_tags JSONB 字段, Roadmap: 认知引擎 (全部完成), source_type 权重全链路落地, material Strike 排除聚类种子, 检索降权 material Strike (×0.2) (+6 more)

### Community 12 - "Archive & Top-Level Dimensions"
Cohesion: 0.16
Nodes (14): 行动面板 Spec (archived), Bond维护 Spec (archived), 聚类涌现 Spec (archived), 混合检索 Spec (archived), 冷启动侧边栏空白问题 — 设计决策, 顶层维度统一模型 Spec (ID 100), seedDimensionGoals — 种子维度生成, 维度=todo.domain统一模型 — 架构决策 (+6 more)

### Community 13 - "Multi-Agent Prompts & Profile"
Cohesion: 0.18
Nodes (13): Multi-Agent Prompt Refactor: Agent + Skill Architecture, Review Guide Skill — Deep Review 1000-2000 Words, Skill Trigger: Explicit Panel + Chat Slash + AI Auto-Route, Three Agents: chat / briefing / onboarding, Todo Decomposition Workflow: Question→Plan→Confirm→Create, Advisor Chat: Person Profile Context Injection, person Table — High-Frequency Character Profiles, Person Profile System (+5 more)

### Community 14 - "Briefing & Report Fixes"
Cohesion: 0.18
Nodes (12): 早报新增 goal_pulse 字段, 晚报新增日记洞察和每日肯定字段, Fix: 早晚报接入 v2 提示词架构, loadWarmContext + buildSystemPrompt 接入, 早报只展示今日排期 + 逾期待办, Fix: 早晚报待办过时 + 数据范围修正, Fix: 今日简报 HTTP 500 崩溃, 前端绕过 api.ts 缺少 Authorization header (+4 more)

### Community 15 - "Daily Report Core"
Cohesion: 0.22
Nodes (11): Cognitive Report Spec (Superseded), Evening Summary, Morning Briefing, Report Prompt Templates, Daily Report Core Spec, Unified Report API, SmartDailyReport Component, Daily Report Extended Spec (+3 more)

### Community 16 - "Agent Tool Behavior & AI Memory"
Cohesion: 0.27
Nodes (10): Fix: AI 工具调用异常, WebSocket 重连导致日记重复创建 Bug, AI 暴露工具名称 Bug, create_record 幂等性兜底, AI 不调用工具（只文字描述）Bug, read_diary 工具（AI 按需读取日记）, 历史消息注入日期分隔标记, 统一日期格式为 ISO 8601 (+2 more)

### Community 17 - "Recording UI & Audio"
Cohesion: 0.2
Nodes (10): Android改用EXCLUSIVE音频焦点类型, Pre-capture阶段提前请求音频焦点, Fix: 录音按钮无法中断系统音频播放, 方向提示pill按钮样式可见性提升, Fix: 录音模式方向提示改为小按钮样式, asr.done后即时显示已记录成功提示, Fix: 录音处理通知状态滞后, 常驻录音呼吸浮窗替代全屏沉浸 (+2 more)

### Community 18 - "Session Recording & Buglog"
Cohesion: 0.29
Nodes (7): FAB Recording Lifecycle (activate/deactivate audio session), AudioSessionPlugin (iOS AVAudioSession + Android AudioFocus), Audio Session Recording Management (121), Bug Log (specs/buglog.md), Bug: Recording Not Interrupting System Audio (2026-04-12), Process Improvement: DeviceId → UserId Full-Stack Migration (2026-04-12), Bug: strike table deletion residual SQL (2026-04-12)

### Community 19 - "Device ID Migration"
Cohesion: 0.33
Nodes (7): DB 约束迁移 044_identity_cleanup.sql, device_id 身份职责下线, device_id 保留职责（WS/ASR/多设备同步）, device_id → user_id 身份迁移, Fix: deviceId 残留清理 — 路由层切换 userId, getDeviceId 标记 @deprecated, 路由层 18 个文件全面切换 getUserId

### Community 20 - "Image & Note Card Fixes"
Cohesion: 0.29
Nodes (7): isImage检测增强覆盖多URL格式, ingest.ts图片source字段修复为image, Fix: 图片插入后显示文字描述而非缩略图, VisionAI失败降级方案, textarea自适应高度(scrollHeight), Fix: 日记卡片编辑窗口自适应+图片缩略图, notes-timeline isImage检测增强

### Community 21 - "Chat Hang & Command Sheet"
Cohesion: 0.33
Nodes (6): chat.done 空内容兜底处理, Fix: Chat AI 回复无限加载, Stream 迭代 60 秒硬超时保护, commandFullMode 单阶段 AI 调用, Fix: 上滑指令 CommandSheet 堵塞无响应, CommandSheet processing 20 秒超时保护

### Community 22 - "Sidebar My World"
Cohesion: 0.4
Nodes (6): 冷启动聚类加速 (Strike<20 阈值=2), 侧边栏「我的世界」重构, 移除维度筛选的理由 (结构来自涌现), Onboarding 种子目标 (seed_goals), 三级层次结构 (L2聚类→L1聚类→目标), MyWorldNode 树结构 API

### Community 23 - "Domain Vocabulary"
Cohesion: 0.5
Nodes (5): 自动收录高频词汇, 冷启动领域选择与词库加载, DashScope VocabularyService 热词集成, 删除自建ASR后处理纠正引擎的理由, 领域词库 DashScope 热词 + 自动收录

### Community 24 - "Record Delete Cascade"
Cohesion: 0.4
Nodes (5): deleteByIds级联删除关联Strike, 存量孤儿Strike清理SQL, Fix: 日记删除后幽灵Strike残留, 064_drop_strike_system后代码残留SQL引用, Fix: 删除日记卡片报错relation strike不存在

### Community 25 - "Device ID Removal"
Cohesion: 0.5
Nodes (5): JWT层移除deviceId只保留userId, 单用户单活跃连接最新覆盖旧策略, Session管理层从deviceId改为userId, Fix: 全面清除deviceId统一使用userId, WebSocket层deviceToWsMap改为userToWsMap

### Community 26 - "Calendar Alarm & Reminder"
Cohesion: 0.4
Nodes (5): 待办写入系统日历 & 闹钟, Intent 队列机制 (App.resume), SystemIntentPlugin (Android Capacitor 插件), 日程提醒本地通知调度, App 启动同步本地通知 (syncTodoReminders)

### Community 27 - "Action Tracking"
Cohesion: 0.67
Nodes (4): Action Event Tracking & Feedback Loop (056), Skip-Frequency Alert (daily-cycle integration), action_event Table (todo_id, type, reason, timestamp), swipe-tracker.ts — Swipe Behavior Persistence

### Community 28 - "Empty State Guide"
Cohesion: 0.5
Nodes (4): 目标空状态, 空状态引导设计, 认知统计空状态, 待办空状态

### Community 29 - "Morning Briefing Fix"
Cohesion: 0.67
Nodes (4): daily-loop改用date-anchor.fmt()本地日期, 早报问候语基于soul/profile驱动, Fix: 早报时区错位+问候语风格, UTC时区导致早报缓存命中昨日数据

### Community 30 - "Onboarding Flow"
Cohesion: 0.5
Nodes (4): CoachMark聚焦操作引导组件, 后端records检查用户是否老用户, Fix: 老用户登录误触发新手引导, Fix: 冷启动第二步改为聚焦操作引导

### Community 31 - "Reminder System Fix"
Cohesion: 0.5
Nodes (4): create_todo/update_todo工具schema添加提醒参数, todo-edit-sheet添加提醒设置UI, Fix: 提醒功能未生效, update_todo触发recalcReminderAt

### Community 32 - "Reader & Daily Review"
Cohesion: 0.5
Nodes (4): 每日回顾阅读体验, 全屏阅读器, 素材阅读器, 选中文字工具栏

### Community 33 - "Recording Resilience"
Cohesion: 0.5
Nodes (4): sendBinary 缓冲队列, 录音本地缓存 (IndexedDB), pending_retry 状态待重试录音, retry-audio HTTP 端点

### Community 34 - "Repo Transaction Support"
Cohesion: 0.5
Nodes (4): createGoalPageWithTodo 共享函数, Queryable 类型 (pg.PoolClient | undefined), 消除 raw SQL 绕过 repo 的技术债理由, Repo 层事务支持

### Community 35 - "Tool Ecosystem Enhance"
Cohesion: 0.67
Nodes (4): 工具生态增强 Spec (ID 117), manage_folder 工具 — 文件夹管理, move_record 工具 — 日记移动, record.domain 文件夹分类系统

### Community 36 - "Daily Report Legacy"
Cohesion: 0.67
Nodes (4): 每日回顾 Spec (archived), 日报四模式 (morning/evening/weekly/monthly), Soul自适应语气策略 — 不硬编码语气, 统一日报系统 Spec (superseded)

### Community 37 - "Chat Greeting Fix"
Cohesion: 0.67
Nodes (3): Chat Floating Input Bar (fixed bottom, keyboard-aware), AI Personalized Greeting (time-of-day + recent diary/todo context), Chat Greeting & Floating Input Fix (superseded)

### Community 38 - "External Integration"
Cohesion: 0.67
Nodes (3): 日历事件自动导入（material 类型）, 外部数据源集成, 浏览器剪藏（material 降权）

### Community 39 - "Chat Intent Routing"
Cohesion: 0.67
Nodes (3): record 为默认意图类型（废弃 mixed）, Fix: 复合日记意图误判为查询指令, 按页面配置工具白名单

### Community 40 - "Tag Limit Rules"
Cohesion: 0.67
Nodes (3): AI提取标签限制最多5个, Fix: 标签系统清理—删除系统标签+限制5个, 删除硬编码SYSTEM_TAGS

### Community 41 - "Auth Error Leak"
Cohesion: 1.0
Nodes (2): useAuth 共享 error state 导致泄漏, Fix: 登录/注册错误状态泄漏

### Community 42 - "Calendar Swipe Fix"
Cohesion: 1.0
Nodes (2): calendar-strip 手势豁免检查, Fix: 日历滑动与 Tab 切换手势冲突

### Community 43 - "Card Expand/Collapse"
Cohesion: 1.0
Nodes (2): canExpand 逻辑修正（只保留 isClamped）, Fix: 日记卡片展开逻辑优化 + 收起按钮高度

### Community 44 - "FAB Over Todo Sheet"
Cohesion: 1.0
Nodes (2): Fix: 待办Sheet打开时FAB录音按钮遮挡, TodoWorkspace onSheetOpenChange回调

### Community 45 - "Note Card Menu Position"
Cohesion: 1.0
Nodes (2): meta行拆两层防止菜单按钮换行, Fix: 日记卡片三点菜单按钮被标签挤到第二行

### Community 46 - "Tab Squeeze Fix"
Cohesion: 1.0
Nodes (2): tablist添加shrink-0防止flex压缩, Fix: 顶部Tab被挤压成竖排

### Community 47 - "Contradiction & Decision"
Cohesion: 1.0
Nodes (2): 矛盾检测 Spec (archived), 决策工坊 Spec (archived)

### Community 48 - "Cognitive Wiki"
Cohesion: 1.0
Nodes (1): Cognitive Wiki Spec

### Community 49 - "Date Format Alignment"
Cohesion: 1.0
Nodes (1): 日期格式对齐（date-format-alignment）

### Community 50 - "Auth Input Alignment"
Cohesion: 1.0
Nodes (1): 登录注册输入框样式（auth-input-style）

### Community 51 - "Chat Mic Alignment"
Cohesion: 1.0
Nodes (1): 聊天麦克风按钮（chat-mic-button）

### Community 52 - "UI Polish Alignment"
Cohesion: 1.0
Nodes (1): UI 细节打磨（ui-polish）

### Community 53 - "Mobile App Entry"
Cohesion: 1.0
Nodes (1): Roadmap: Mobile App (~65%)

### Community 54 - "Spec Template"
Cohesion: 1.0
Nodes (1): Spec模板文件

## Knowledge Gaps
- **222 isolated node(s):** `Goal Table → VIEW Migration`, `Domain CHECK Constraint (中文 domain 枚举)`, `swipe-tracker.ts — Swipe Behavior Persistence`, `Decision Context (gatherDecisionContext)`, `agent_plan DB Table (steps, status, rollback_info)` (+217 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Auth Error Leak`** (2 nodes): `useAuth 共享 error state 导致泄漏`, `Fix: 登录/注册错误状态泄漏`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Calendar Swipe Fix`** (2 nodes): `calendar-strip 手势豁免检查`, `Fix: 日历滑动与 Tab 切换手势冲突`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Card Expand/Collapse`** (2 nodes): `canExpand 逻辑修正（只保留 isClamped）`, `Fix: 日记卡片展开逻辑优化 + 收起按钮高度`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FAB Over Todo Sheet`** (2 nodes): `Fix: 待办Sheet打开时FAB录音按钮遮挡`, `TodoWorkspace onSheetOpenChange回调`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Note Card Menu Position`** (2 nodes): `meta行拆两层防止菜单按钮换行`, `Fix: 日记卡片三点菜单按钮被标签挤到第二行`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tab Squeeze Fix`** (2 nodes): `tablist添加shrink-0防止flex压缩`, `Fix: 顶部Tab被挤压成竖排`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Contradiction & Decision`** (2 nodes): `矛盾检测 Spec (archived)`, `决策工坊 Spec (archived)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cognitive Wiki`** (1 nodes): `Cognitive Wiki Spec`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Date Format Alignment`** (1 nodes): `日期格式对齐（date-format-alignment）`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Input Alignment`** (1 nodes): `登录注册输入框样式（auth-input-style）`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Chat Mic Alignment`** (1 nodes): `聊天麦克风按钮（chat-mic-button）`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Polish Alignment`** (1 nodes): `UI 细节打磨（ui-polish）`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Mobile App Entry`** (1 nodes): `Roadmap: Mobile App (~65%)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Spec Template`** (1 nodes): `Spec模板文件`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Spec Index — Master Catalog` connect `Tag & Todo Bug Fixes` to `Keyboard & Native Feel`, `Multi-Agent Prompts & Profile`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Daily Report Core Spec` (e.g. with `Daily Report Merge Spec` and `Daily Report Spec (Legacy)`) actually correct?**
  _`Daily Report Core Spec` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Goal Table → VIEW Migration`, `Domain CHECK Constraint (中文 domain 枚举)`, `swipe-tracker.ts — Swipe Behavior Persistence` to the rest of the system?**
  _222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tag & Todo Bug Fixes` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Cognitive Engine v2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Design Alignment` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Domain Deprecation & Goal Quality` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._