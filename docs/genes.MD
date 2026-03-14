# v2note 基因库

每个基因片段 = 一个独立功能模块。修改代码前先更新基因描述，再生成代码。

> 详细基因描述按需加载，存放在 [`docs/gene/`](./gene/) 目录下。

---

## 版本记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v2026.03.15 | 2026-03-15 | AGENTS.md行为宪法+Identity身份系统：(1)gateway/AGENTS.md 重写为完整AI行为宪法——核心使命(想法→行动)+文件地图&更新时机+安全规则(不可覆盖)+对话纪律+简报纪律+沟通风格(可被Identity覆盖)+场景指南(reflect/情绪/重复模式/复盘/行动)+技能路由+主动巡检静默规则+绝对禁止；(2)prompt-builder.ts——路径Agent.md→AGENTS.md，移除commandTableIdx截断逻辑(AGENTS.md无指令表)，热层注入完整AGENTS.md，移除CHAT_GUARDRAILS/BRIEFING_GUARDRAILS单独注入(已在AGENTS.md中)，warm层section名"AI 人格定义"→"AI 身份"；(3)anti-hallucination.ts——导出置空并标记@deprecated，对话纪律/简报纪律已移入AGENTS.md；(4)soul/manager.ts——updateSoul prompt适配Identity结构(AI名字/性格特征/互动方式偏好/专注领域/禁忌/沟通风格偏好)，区分Identity不应包含的内容(用户个人信息→用户画像)；(5)soul-tab.tsx——空白时显示Identity模板引导(6项分类列表)，placeholder更新，默认title"AI 人格"→"AI 身份"；(6)memory-soul-overlay.tsx——Tab名+title"AI 人格"→"AI 身份" |
| v2026.03.14c | 2026-03-14 | user_id全写入路径补全：(1)9个repository create/upsert方法新增user_id可选参数(record/goal/pending-intent/memory/ai-diary/review/custom-skill/skill-config/notebook)；(2)ON CONFLICT用COALESCE(EXCLUDED.user_id, table.user_id)保留已有user_id；(3)long-term.ts saveMemory/loadMemory透传userId；(4)memory/manager.ts maybeCreateMemory按userId分支UPDATE/DELETE(ByUser vs ByDevice)；(5)diary/manager.ts appendToDiary/regenerateSummary/extractToMemory透传userId；(6)soul/profile manager loadSoul/loadProfile userId-first+device-fallback；(7)handlers全链路透传——process/asr/reflect/daily-loop/todo/chat均传userId到repo和manager；(8)routes写入——POST records/goals/reviews getUserId()??undefined传入create；(9)builtin tools callBuiltinTool新增第4参数userId，所有handle*函数透传；(10)mcp/server.ts handleRpcRequest透传userId；(11)index.ts startASR传connectionUserMap userId；(12)修复string\|null→string\|undefined类型不匹配（??undefined转换）；(13)更新ai-diary.test.ts和diary/manager.test.ts适配新参数 |
| v2026.03.14b | 2026-03-14 | 录音处理硬编码+Skills/Insights双目录架构+记忆系统Mem0重构：(1)process-prompt.ts 硬编码核心提取规则（意图分类+转达检测+转写清理+标签匹配+反幻觉纪律+JSON输出格式），不再动态加载skill构建prompt；(2)process.ts 简化——移除buildSystemPrompt/MCP工具注入/上下文注入AI prompt，改用硬编码+可选技能追加；(3)skills/ 目录清理——删除 intent-classify/relay-detect（已硬编码），迁移 reflect/meta-question/second-order-thinking 到 insights/；(4)新建 gateway/insights/ 目录——reflect、meta-question、second-order-thinking（迁移）+ munger-review（新建芒格决策复盘）；(5)SKILL.md frontmatter简化——去掉type/builtin字段，目录即类型；(6)skills/types.ts——删除SkillType/type/builtin，新增version/trigger/rag_required；(7)loader.ts——接收dir参数支持skills/和insights/，删除partitionSkillsByRelevance/getSkillManifest，filterActiveSkills去掉type参数；(8)prompt-builder.ts——只服务chat/briefing，删除process分支和cold tier；(9)tiers.ts——ContextTier删除cold字段，ContextMode只保留chat/briefing；(10)anti-hallucination.ts——删除PROCESS_GUARDRAILS（已内联到process-prompt）；(11)context/loader.ts——embedding优先召回+keyword fallback，删除[目标]memory分支（统一排序）；(12)chat.ts——从insights/加载选中洞察技能，支持insight mode；(13)memory/manager.ts Mem0两阶段重写——一次AI调用完成候选提取+相似记忆比较+决策（ADD/UPDATE/DELETE/NONE），替代原来两步分离（maybeCreateMemory+saveWithDedup）；(14)soul/profile manager per-user写入队列串行化（防止并发覆盖）；(15)session/manager.ts——MemoryManager挂在session上（per-device单例，非每次new）；(16)process.ts soul/profile按需更新——关键词预判（soulKeywords/profileKeywords），大多数录音跳过更新节省2次AI调用；(17)前端 local-config.ts——新增selectedInsightSkill+source字段；(18)use-chat.ts 支持insight mode；(19)review-overlay.tsx——洞察启动器，选技能→对话；(20)skills-page.tsx——双section（处理技能+洞察视角），均可编辑/启停/新建，去掉builtin/type区分 |
| v2026.03.14 | 2026-03-14 | AI伴侣窗口：(1)AiWindow 统一交互入口——嵌入 timeline 顶部，优先级消息队列（reflect=1/nudge=2/briefing=3/summary=4/status=10），点击路由到对话或 overlay；(2)Reflect 技能——process 后生成苏格拉底追问（张力识别：矛盾>模糊>情绪>未说完>重复），gateway/insights/reflect/SKILL.md；(3)AI 状态消息——WebSocket 认证后基于 soul 生成个性化状态，时段问候语（早/中/下午/晚/深夜）；(4)FAB 变形——idle 显示 Sparkles 图标，processing 态胶囊形显示俏皮话（"正在翻译你的脑电波…"），30s 安全超时自动重置；(5)聊天继承——点击 AiWindow 进入对话时 AI 的话作为 assistant 消息显示（非用户消息），通过 assistantPreamble 传递上下文给 gateway；(6)gateway-client 新增 reflect.question + ai.status 消息类型；(7)proactive 消息由 AiWindow 内部监听替代 NudgeToastListener；(8)chat-return 事件——关闭对话时 dispatch 自定义事件清除 reflect 消息；(9)CSS 动画 bubble-enter/bubble-fade/spin-slow |
| v2026.03.13c | 2026-03-13 | 日记卡片重新设计：(1)TimelineCard 元数据第一行合并——时间·录音时长·位置·标签用 `·` 分隔，突出内容区；(2)卡片折叠/展开——默认折叠 line-clamp-4，点击展开显示完整摘要+转录原文+待办事项；(3)展开按需加载——useNoteDetail(expanded ? id : null) 条件性 fetch，带 loading 动画，缓存已加载数据；(4)取消 NoteDetail 详情页——删除 NoteDetail overlay、detailId state、onNoteClick prop 传递；(5)NotesTimeline 接口简化——移除 onNoteClick prop，卡片自身处理展开；(6)选择模式不变——长按进入，点击切换选中（不触发展开） |
| v2026.03.13b | 2026-03-13 | 检查更新+OTA热更新+APK版本升级：(1)app_release 表（migration 015），存储 apk/ota 两种发布类型；(2)app-release repository——findLatest 支持 version_code 比较+OTA min_native_version 检查；(3)releases 路由——GET /check 公开检查、GET /bundles/:filename 流式下载、POST 创建/上传/编辑（Admin鉴权 ADMIN_USER_ID）；(4)bundle 存储 gateway/uploads/bundles/ + sha256 校验；(5)前端 updater.ts——lazy import Capacitor 插件、checkForUpdate/applyOtaUpdate/openApkDownload；(6)useUpdateCheck hook——3s 延迟检查、OTA 静默自动应用、APK 弹窗提示；(7)UpdateDialog 组件——AlertDialog 版本+changelog+mandatory 支持；(8)@capgo/capacitor-updater 集成（autoUpdate:false 手动控制）；(9)发布脚本 publish-ota.sh/publish-apk.sh/sync-version.cjs；(10)cap:sync 集成版本同步 |
| v2026.03.13 | 2026-03-13 | 用户登录认证+多设备数据统一：(1)app_user 表+refresh_token 表（migration 014），所有用户级表加 user_id 列+索引；(2)Auth 模块——bcryptjs 密码 hash(cost=12)、JWT 签发/验证(access 15min/refresh 30d)、getAuthContext 中间件解析 Bearer token；(3)linkDeviceToUser——关联设备+回填所有历史数据 user_id；(4)Auth REST 路由——POST register/login/refresh/logout + GET me；(5)10个 repository 新增 findByUser 方法(memory/record/soul/user-profile/goal/todo/notebook/ai-diary/pending-intent/skill-config)；(6)Handler+Manager 改造——process/chat payload 加 userId，context loader 支持 user-based 查询，soul/profile manager 支持 upsertByUser；(7)WebSocket 认证——新增 auth 消息类型+connectionUserMap，连接后发送 JWT 认证；(8)前端 Auth——shared/lib/auth.ts 客户端状态管理(token 持久化)、api.ts 自动 Authorization header+401 自动 refresh、gateway-client 连接后发送 auth；(9)登录/注册 UI——features/auth/ 手机号+密码表单(shadcn)，app/page.tsx auth gate 强制登录；(10)sidebar 退出登录+用户信息显示，header 用户昵称首字母头像 |
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
| gene_ai_processing | AI处理管道，硬编码process-prompt(意图+转达+清理+标签)，可选skill追加，不注入上下文到AI | [ai-processing.md](./gene/ai-processing.md) |
| gene_command_system | JSON驱动命令注册表，文本+语音触发，别名/中文名匹配 | [command-system.md](./gene/command-system.md) |
| gene_todo_panel | 待办看板，右侧3/4屏滑出，三Tab(今日时间轴/全部按域分组/目标记忆) | [todo-panel.md](./gene/todo-panel.md) |
| gene_today_gantt | 甘特图今日任务时间轴，按domain配色，AI可协助标识 | [today-gantt.md](./gene/today-gantt.md) |
| gene_settings_editor | 设置编辑器，JSON schema驱动，Gateway地址+ASR模式配置 | [settings-editor.md](./gene/settings-editor.md) |
| gene_skills_management | 技能管理，skills/(处理技能)+insights/(洞察视角)双目录，CRUD+启停+新建，无type/builtin区分 | [skills-management.md](./gene/skills-management.md) |
| gene_profile_editor | 用户画像/信息/工具配置编辑器，三tab页 | [profile-editor.md](./gene/profile-editor.md) |
| gene_tag_system | 标签管理，AI仅匹配已有标签，不创建新标签 | [tag-system.md](./gene/tag-system.md) |
| gene_note_detail | **已废弃** — 详情页取消，功能内联到 TimelineCard 展开态 | [note-detail.md](./gene/note-detail.md) |
| gene_timeline_card | 日记卡片折叠/展开，元数据单行，展开显示原文+待办，长按多选+批量删除 | [timeline-card.md](./gene/timeline-card.md) |
| gene_search | 全文搜索，ILIKE匹配，batch load summary+tags | [search.md](./gene/search.md) |
| gene_review_chat | 复盘对话，流式AI对话，从insights/加载选中洞察技能，支持review/command/insight三模式 | [review-chat.md](./gene/review-chat.md) |
| gene_mcp_integration | MCP双向集成，Client(连接外部工具)+Server(暴露v2note能力) | [mcp-integration.md](./gene/mcp-integration.md) |
| gene_builtin_tools | AI内置工具，create_diary/delete_diary/create_todo/create_skill | [builtin-tools.md](./gene/builtin-tools.md) |
| gene_proactive_ai | AI主动提醒，BullMQ持久化+setInterval降级，impact智能过滤 | [proactive-ai.md](./gene/proactive-ai.md) |
| gene_time_management | 待办时间估算+enrichment，domain/impact/ai_actionable，目标感知评分 | [time-management.md](./gene/time-management.md) |
| gene_local_config | 本地配置存储层，跨平台(Capacitor/localStorage) | [local-config.md](./gene/local-config.md) |
| gene_sync | 数据同步，设备注册+REST API同步 | [sync.md](./gene/sync.md) |
| gene_offline | 离线支持，OfflineBanner+WebSocket自动重连 | [offline.md](./gene/offline.md) |
| gene_second_order_thinking | 二阶思考洞察视角（已迁移到insights/），分析"问题背后的问题" | [second-order-thinking.md](./gene/second-order-thinking.md) |
| gene_context_architecture | 分层上下文架构(Hot/Warm双层，无Cold)，embedding优先+keyword fallback记忆召回，仅服务chat/briefing | [context-architecture.md](./gene/context-architecture.md) |
| gene_daily_loop | 忙人日常循环，晨间简报+转达追踪+日终总结+主动推送 | [daily-loop.md](./gene/daily-loop.md) |
| gene_intent_understanding | 意图分类（硬编码于process-prompt）+目标树+待确认意图，五类意图路由，Chat确认流程 | [intent-understanding.md](./gene/intent-understanding.md) |
| gene_memory_architecture | 记忆架构三层分离：Identity(AI身份，用户可自定义名字/性格/互动方式/专注领域/禁忌/沟通风格) + UserProfile(用户事实) + Memory(Mem0两阶段ADD/UPDATE/DELETE)，per-user写入队列串行化，per-device MemoryManager单例 | [memory-architecture.md](./gene/memory-architecture.md) |
| gene_ai_diary | AI日记本系统，每日每笔记本一条，摘要+全文，自动追加+AI摘要+记忆提取 | [ai-diary.md](./gene/ai-diary.md) |
| gene_recording_immersive | 录音全屏沉浸界面，暗色剧场+方向感知光晕+大波形+边缘方向图标+弹性FAB | [recording-immersive.md](./gene/recording-immersive.md) |
| gene_auth | 用户登录认证+多设备数据统一，手机号+密码，JWT双token，强制登录，设备关联+数据回填 | [auth.md](./gene/auth.md) |
| gene_app_update | 检查更新+OTA热更新+APK版本升级，双层更新机制，Admin发布管理，静默OTA+弹窗APK | [app-update.md](./gene/app-update.md) |
| gene_ai_companion | AI伴侣窗口，统一交互入口，优先级消息队列，reflect追问(insights/)+AI状态+主动推送，FAB变形，聊天继承 | [ai-companion.md](./gene/ai-companion.md) |
| gene_behavior_constitution | AI行为宪法(AGENTS.md)，系统层规则(安全/纪律/沟通风格/场景指南/技能路由/静默规则)，可被用户Identity覆盖沟通风格和场景指南 | — |
| gene_munger_review | 芒格决策复盘洞察视角，反转思考+多学科心智模型+能力圈+二阶效应+检查清单 | — |

---

