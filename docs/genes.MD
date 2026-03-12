# v2note 基因库

每个基因片段 = 一个独立功能模块。修改代码前先更新基因描述，再生成代码。

> 详细基因描述按需加载，存放在 [`docs/gene/`](./gene/) 目录下。

---

## 版本记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v2026.03.12b | 2026-03-12 | 核心重构四阶段+测试+UI重设计：**Phase 1 待办日期设置**——(1)TodoItem 补全 scheduled_start/scheduled_end/estimated_minutes/priority 字段；(2)PATCH /api/v1/todos/:id 扩展接受调度字段；(3)TodoDetailSheet 底部弹窗（日期/时间原生 picker + showPicker() overlay、时长快选pill、域名标签、AI执行计划展示、"让AI帮忙"入口）；(4)update_todo 内置工具。**Phase 2 记忆架构重构**——(5)migration 012：user_profile + notebook + ai_diary 三表；(6)Soul 限定为仅存 AI 人格（排除用户个人信息）；(7)UserProfile 管理器（AI 提取用户事实信息，独立于 soul）；(8)profile REST 路由 GET/PATCH /api/v1/profile；(9)context/loader + prompt-builder 并行加载 userProfile 到 warm 层。**Phase 3 AI日记本**——(10)ai-diary repo（upsert/findByDate/findSummaries/findFull/updateSummary）；(11)notebook repo（findOrCreate/ensureSystemNotebooks：ai-self + default）；(12)diary manager（appendToDiary 快速追加、regenerateSummary AI 摘要、extractToMemory 长期记忆提取）；(13)notebook REST 路由；(14)proactive engine 集成（晚间摘要+周日深度记忆提取）；(15)create_notebook 内置工具。**Phase 4 Impact UX**——(16)impact-dots 重写：1-3隐藏、4-6数字、7-8火焰、9-10脉冲火焰；(17)AI可执行任务紫色背景+紫色sparkle图标。**测试**——(18)vitest 框架配置（gateway node + frontend jsdom）；(19)57 个测试全部通过（41 gateway + 16 frontend），覆盖 builtin-tools/repos/diary-manager/profile-manager/context-loader/types/api/impact-dots/domain-config。**UI重设计**——(20)TodoDetailSheet redesign：drag handle、淡色域名图标、showPicker() 日期/时间覆盖层、formatDateDisplay 友好文本（今天/明天/X月X日 周X）、域名色时长高亮pill、自定义时长+min单位、深色保存按钮+pb-safe、Sheet overlay 减淡至 bg-black/50；(21)FAB 录音界面全屏沉浸重设计：暗色剧场背景、方向感知彩色光晕（红/琥珀/翡翠）、32根大波形随方向变色、边缘56x56方向图标（X取消/Command指令/Lock常驻）选中1.3x放大+发光、text-5xl计时器+红色呼吸灯、FAB弹性跟随手指、RecordingImmersive 升级（text-7xl计时器、大波形、三按钮横排控件） |
| v2026.03.12 | 2026-03-12 | 意图理解系统：(1)intent-classify SKILL.md——替代 todo-extract 成为主力 process 技能，将语音分类为 task/wish/goal/complaint/reflection 五种意图类型；(2)目标树——新增 goal 表+pending_intent 表（migration 011），goal 替代 [目标] memory hack，todo.goal_id 关联目标；(3)意图路由——process handler 解析 intents 数组，task→todo，wish/goal→pending_intent 暂存待确认；(4)目标自动关联——创建 todo 时 extractKeywords 匹配活跃目标；(5)Chat 确认流程——chat handler 注入 pending intents 到 system prompt，新增 create_goal/confirm_intent 内置工具；(6)上下文更新——context/loader 并行加载 goals，goal 表有数据时 [目标] memory 降级；(7)前端 GoalsTab 重构——优先 goal 表数据，fallback [目标] memory；(8)REST 路由 GET/POST/PATCH /api/v1/goals + GET /api/v1/intents/pending；(9)extractKeywords 提取到 gateway/src/lib/text-utils.ts 共享模块 |
| v2026.03.11 | 2026-03-11 | AI能力修复两项：(1)AI SDK v6 端点修复——`@ai-sdk/openai` v3 默认走 Responses API (`/v1/responses`)，DashScope 不支持返回404，改为 `provider.chat(model)` 强制走 Chat Completions API (`/v1/chat/completions`)；(2)BullMQ Redis 连接修复——无 Redis 时 BullMQ Queue 测试产生大量未捕获 ECONNREFUSED 错误可能导致 gateway 崩溃，改用 `node:net` TCP 端口探测（3s 超时快速失败）+ Worker 添加 error handler |
| v2026.03.09b | 2026-03-09 | 后端增强+UI重构：(1)Vercel AI SDK v6——provider.ts 重写为 generateText/streamText/generateObject，新增 generateStructured<T> Zod 类型安全提取；(2)Mem0 语义记忆——新增 embeddings.ts（DashScope text-embedding-v3 + 余弦相似度），MemoryManager.saveWithDedup 相似度>0.85 自动去重更新；(3)BullMQ 持久化调度——ProactiveEngine.start() 尝试 Redis BullMQ cron（7:30/14:00/20:00），优雅降级 setInterval；(4)MCP Server——新增 mcp/server.ts JSON-RPC 2.0 端点 POST /mcp 暴露内置工具+技能；(5)晨间简报404修复——daily-loop handler 包装 DB try/catch + HttpError 状态传播；(6)Header 布局——左侧头像+洞察(review)，右侧搜索+待办(todos)；(7)TodoPanel 右侧3/4屏滑出看板——三Tab（今日时间轴/全部按域分组/目标记忆），替代原全屏 TodoDiaryCard |
| v2026.03.09 | 2026-03-09 | Todo Enrichment + 分层上下文架构：(1)Todo 新增 domain/impact/ai_actionable/ai_action_plan 四字段（migration 010），estimateBatchTodos 扩展为全面 enrichment（含目标感知 impact 评分+AI可执行性判断）；(2)Memory 目标识别——maybeCreateMemory 自动将用户目标声明存为 [目标] 前缀高 importance 记忆；(3)分层上下文架构（借鉴 OpenClaw）——新增 gateway/src/context/ 模块（tiers.ts/anti-hallucination.ts/loader.ts），prompt-builder 重构为 Hot/Warm/Cold 三层；(4)Memory 相关性评分——关键词重叠(0.4)+重要性(0.3)+时效性(0.3)，[目标]记忆始终浮出；(5)process模式跳过soul加载+并行加载；(6)前端 TodoDiaryCard 按 domain 分组+impact排序+ai_actionable标识；(7)Gantt按domain配色；(8)晨间简报标注domain/impact/AI可协助；(9)主动推送仅impact>=4触发 |
| v2026.03.06c | 2026-03-06 | UI重构四项：(1)设置集成到侧栏；(2)详情页清理——删除灵感+标题区块；(3)搜索缩为图标；(4)AI洞察顶栏按钮 |
| v2026.03.06b | 2026-03-06 | 忙人日常循环（四阶段）：晨间简报+信息转达追踪+日终总结+主动推送 |
| v2026.03.06 | 2026-03-06 | 录音识别重复字/乱码修复：`usePCMRecorder` 新增 `activeRef` 同步 ref 防止双重录音 |
| v2026.03.05d | 2026-03-05 | 新设备初始化日记 |
| v2026.03.05c | 2026-03-05 | 录音开头丢字修复（pre-capture） |
| v2026.03.05b | 2026-03-05 | UI调整+FAB修复：个人画像/AI记忆 tab互换+FAB移动端点击修复 |
| v2026.03.05a | 2026-03-05 | AI内置工具增强：新增 create_todo |
| v2026.03.05 | 2026-03-05 | ASR引擎替换为Python SDK |
| v2026.03.03e | 2026-03-03 | 技能模块修复+SKILL.md重写 |
| v2026.03.03d | 2026-03-03 | 技能管理系统重构 |
| v2026.03.03c | 2026-03-03 | 修复：ASR模型名称+工具调用提取+斜杠命令执行 |
| v2026.03.03b | 2026-03-03 | AI内置工具：create_diary/delete_diary+ASR/文本模型切换 |
| v2026.03.03 | 2026-03-03 | ASR模式切换：录后识别+实时识别 |
| v2026.03.02 | 2026-03-02 | 安卓录音崩溃修复+Gateway URL运行时可配置 |
| v2026.03.01f | 2026-03-01 | react-markdown v9兼容修复 |
| v2026.03.01e | 2026-03-01 | 搜索结果修复：summary+tags数据 |
| v2026.03.01d | 2026-03-01 | 指令模式修复3项 |
| v2026.03.01c | 2026-03-01 | UX走查11项问题全部修复 |
| v2026.03.01b | 2026-03-01 | UX走查发现11项体验问题 |
| v2026.03.01 | 2026-03-01 | 命令系统修复5项 |
| v2026.02.28c | 2026-02-28 | 命令模式增强 |
| v2026.02.28b | 2026-02-28 | 录音UI精修 |
| v2026.02.28 | 2026-02-28 | AI转写替代AI摘要 |
| v2026.02.27e | 2026-02-27 | 新增二阶思考skill |
| v2026.02.27d | 2026-02-27 | 交互修复：FAB点击闪退+ChatBubble双重渲染 |
| v2026.02.26d | 2026-02-26 | 录音交互优化：三向拖拽+常驻录音 |
| v2026.02.27c | 2026-02-27 | Bug修复：recording阶段+全屏背景+TextBottomSheet |
| v2026.02.27b | 2026-02-27 | Bug修复：三色块+TextBottomSheet+IME+Toast |
| v2026.02.27 | 2026-02-27 | UI优化：FAB+全屏录音+/命令对话 |
| v2026.02.25 | 2026-02-25 | 日记删除/复盘功能 |
| v2026.02.22 | 2026-02-22 | 安卓侧滑返回修复 |
| v2026.02.20 | 2026-02-20 | v6 基因架构重构 |

---

## 基因索引

| 基因 | 描述 | 详细文档 |
|------|------|----------|
| gene_voice_recording | 语音录制与ASR转写，三阶段录音（pressing/recording/locked），Python DashScope SDK实时+录后识别 | [voice-recording.md](./gene/voice-recording.md) |
| gene_text_input | 文本输入与命令对话，TextBottomSheet，"/"触发流式AI指令 | [text-input.md](./gene/text-input.md) |
| gene_ai_processing | AI处理管道，分层上下文(Hot/Warm/Cold)，转写清理+技能提取+工具调用循环 | [ai-processing.md](./gene/ai-processing.md) |
| gene_command_system | JSON驱动命令注册表，文本+语音触发，别名/中文名匹配 | [command-system.md](./gene/command-system.md) |
| gene_todo_panel | 待办看板，右侧3/4屏滑出，三Tab(今日时间轴/全部按域分组/目标记忆) | [todo-panel.md](./gene/todo-panel.md) |
| gene_today_gantt | 甘特图今日任务时间轴，按domain配色，AI可协助标识 | [today-gantt.md](./gene/today-gantt.md) |
| gene_settings_editor | 设置编辑器，JSON schema驱动，Gateway地址+ASR模式配置 | [settings-editor.md](./gene/settings-editor.md) |
| gene_skills_management | 技能管理，review(复盘视角)+process(处理技能)两类，CRUD+AI自动创建 | [skills-management.md](./gene/skills-management.md) |
| gene_profile_editor | 用户画像/信息/工具配置编辑器，三tab页 | [profile-editor.md](./gene/profile-editor.md) |
| gene_tag_system | 标签管理，AI仅匹配已有标签，不创建新标签 | [tag-system.md](./gene/tag-system.md) |
| gene_note_detail | 笔记详情与编辑，支持删除，文字/语音智能显示 | [note-detail.md](./gene/note-detail.md) |
| gene_multiselect_delete | 时间线长按多选+批量删除，语音/文字类型标识 | [multiselect-delete.md](./gene/multiselect-delete.md) |
| gene_search | 全文搜索，ILIKE匹配，batch load summary+tags | [search.md](./gene/search.md) |
| gene_review_chat | 复盘对话，流式AI对话，技能视角选择，命令模式 | [review-chat.md](./gene/review-chat.md) |
| gene_mcp_integration | MCP双向集成，Client(连接外部工具)+Server(暴露v2note能力) | [mcp-integration.md](./gene/mcp-integration.md) |
| gene_builtin_tools | AI内置工具，create_diary/delete_diary/create_todo/create_skill | [builtin-tools.md](./gene/builtin-tools.md) |
| gene_proactive_ai | AI主动提醒，BullMQ持久化+setInterval降级，impact智能过滤 | [proactive-ai.md](./gene/proactive-ai.md) |
| gene_time_management | 待办时间估算+enrichment，domain/impact/ai_actionable，目标感知评分 | [time-management.md](./gene/time-management.md) |
| gene_local_config | 本地配置存储层，跨平台(Capacitor/localStorage) | [local-config.md](./gene/local-config.md) |
| gene_sync | 数据同步，设备注册+REST API同步 | [sync.md](./gene/sync.md) |
| gene_offline | 离线支持，OfflineBanner+WebSocket自动重连 | [offline.md](./gene/offline.md) |
| gene_second_order_thinking | 二阶思考技能，分析"问题背后的问题" | [second-order-thinking.md](./gene/second-order-thinking.md) |
| gene_context_architecture | 分层上下文架构(Hot/Warm/Cold)，记忆相关性评分，反幻觉纪律 | [context-architecture.md](./gene/context-architecture.md) |
| gene_daily_loop | 忙人日常循环，晨间简报+转达追踪+日终总结+主动推送 | [daily-loop.md](./gene/daily-loop.md) |
| gene_intent_understanding | 意图分类+目标树+待确认意图，五类意图路由，Chat确认流程 | [intent-understanding.md](./gene/intent-understanding.md) |
| gene_memory_architecture | 记忆架构三层分离：Soul(AI人格) + UserProfile(用户事实) + Memory(长期记忆) | [memory-architecture.md](./gene/memory-architecture.md) |
| gene_ai_diary | AI日记本系统，每日每笔记本一条，摘要+全文，自动追加+AI摘要+记忆提取 | [ai-diary.md](./gene/ai-diary.md) |
| gene_recording_immersive | 录音全屏沉浸界面，暗色剧场+方向感知光晕+大波形+边缘方向图标+弹性FAB | [recording-immersive.md](./gene/recording-immersive.md) |

---

## UX Issues Backlog (v2026.03.01 走查) — 已全部修复 (v2026.03.01c)

<details>
<summary>展开查看已修复的11项问题</summary>

### P0 — 功能性问题

| # | 问题 | 修复内容 |
|---|------|----------|
| 1 | 搜索完全失效 | 搜索路由移至 `:id` 之前注册 |

### P1 — 体验严重缺陷

| # | 问题 | 修复内容 |
|---|------|----------|
| 2 | 复盘结果markdown未渲染 | 新增 markdown-content.tsx |
| 3 | 文字笔记详情页冗余 | 隐藏转录原文区块 |
| 4 | 历史复盘卡片markdown未清理 | stripMarkdown() 清理预览 |
| 5 | 详情页无删除入口 | header新增Trash2删除按钮 |

### P2 — 体验粗糙

| # | 问题 | 修复内容 |
|---|------|----------|
| 6 | AI画像显示原始markdown | MarkdownContent渲染 |
| 7 | AI记忆与个人画像重复 | tab重新组织 |
| 8 | 复盘ISO日期格式 | cleanDates()中文格式 |
| 9 | 命令列表不可点击 | command chip按钮 |
| 10 | 笔记卡片无类型标识 | Mic/Type图标 |
| 11 | 工具配置手写JSON | 实时校验提示 |

</details>
