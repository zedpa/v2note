# v2note 基因库

每个基因片段 = 一个独立功能模块。修改代码前先更新基因描述，再生成代码。

---

## gene_voice_recording
### 功能描述
语音录制与实时 ASR 转写。用户通过 FAB 按钮长按录音，PCM 音频流通过 WebSocket 发送到 Gateway，Gateway 连接阿里云 DashScope 实时语音识别服务。

### 详细功能
- 功能1：FAB 按钮手势控制（长按录音、松开发送、上滑锁定、左滑取消）
- 功能2：PCM 音频采集（Web Audio API worklet）
- 功能3：WebSocket 二进制帧传输 PCM 数据
- 功能4：Gateway 连接 DashScope Realtime ASR
- 功能5：实时转写文本回传（partial + sentence 事件）
- 功能6：录音完成后创建 record + transcript，触发 AI 处理

### 关键文件
- `features/recording/components/fab.tsx` — FAB 组件
- `features/recording/components/recording-immersive.tsx` — 锁定模式全屏录音
- `features/recording/hooks/use-pcm-recorder.ts` — PCM 录音 hook
- `features/recording/hooks/use-fab-gestures.ts` — 手势 hook
- `gateway/src/handlers/asr.ts` — ASR 处理器
- `public/worklets/pcm-processor.js` — Web Audio worklet

### 测试描述
- 输入：长按 FAB 3 秒 → 说话 → 松开
- 输出：显示实时转写文字 → 录音保存 → 创建笔记

---

## gene_text_input
### 功能描述
文本输入与命令自动补全。TextBottomSheet 支持输入文字笔记或 /命令。

### 详细功能
- 功能1：底部抽屉文本输入（Drawer 组件）
- 功能2：/ 开头触发命令自动补全
- 功能3：普通文本创建手动笔记（通过 API）
- 功能4：命令执行通过 registry 路由

### 关键文件
- `features/recording/components/text-bottom-sheet.tsx`
- `features/recording/components/input-bar.tsx`
- `features/notes/lib/manual-note.ts`

### 测试描述
- 输入：点击 FAB → 输入 "/todos" → 回车
- 输出：打开待办日记卡 overlay

---

## gene_ai_processing
### 功能描述
AI 处理管道。转写文本经过去口语化处理，按激活技能提取结构化数据（待办、客户要求等），标签仅匹配已有标签。

### 详细功能
- 功能1：去口语化处理（移除"嗯""那个""就是说"等填充词）
- 功能2：按技能提取 JSON 结构化数据
- 功能3：标签仅匹配已有标签列表，不创建新标签
- 功能4：生成 summary（书面化文本）
- 功能5：MCP 工具调用循环（最多 3 轮）
- 功能6：结果写入数据库
- 功能7：后台触发时间估算和记忆更新

### 关键文件
- `gateway/src/handlers/process.ts` — 处理入口
- `gateway/src/skills/prompt-builder.ts` — 系统 prompt 构建
- `gateway/src/skills/loader.ts` — 技能加载
- `gateway/src/skills/types.ts` — 技能类型

### 测试描述
- 输入：口语化文本 "嗯那个明天要开会啊然后就是说下午三点"
- 输出：summary = "明天下午三点开会"，todos = ["明天下午三点开会"]，tags = []（无匹配标签）

---

## gene_command_system
### 功能描述
JSON 驱动的命令注册表。所有功能通过 /command 接入，支持文本输入和语音触发。

### 详细功能
- 功能1：commands.json 定义命令（名称、别名、描述、分类）
- 功能2：命令解析（/name args 格式）
- 功能3：别名和中文名匹配
- 功能4：语音命令检测（ASR 转写后短文本匹配）
- 功能5：命令路由到 overlay 或执行器
- 功能6：日期范围解析（中文和 ISO 格式）

### 关键文件
- `features/commands/lib/commands.json` — 命令定义
- `features/commands/lib/registry.ts` — 命令注册与执行
- `features/commands/lib/parser.ts` — 命令/日期解析
- `gateway/src/handlers/voice-commands.ts` — 语音命令匹配

### 测试描述
- 输入：文本 "/todos" 或语音 "打开待办"
- 输出：触发 todos overlay 打开

---

## gene_todo_diary_card
### 功能描述
/todos 命令触发的待办日记卡片，全屏 overlay 展示按日期分组的待办列表。

### 详细功能
- 功能1：全屏 overlay 展示
- 功能2：待办按日期分组显示
- 功能3：点击切换完成状态（乐观更新）
- 功能4：点击跳转到来源笔记
- 功能5：已完成项折叠显示

### 关键文件
- `features/todos/components/todo-diary-card.tsx`
- `features/todos/hooks/use-todos.ts`

### 测试描述
- 输入：输入 /todos
- 输出：弹出待办日记卡片，显示分组待办列表

---

## gene_today_gantt
### 功能描述
/today-todo 命令触发的甘特图风格今日任务时间轴。

### 详细功能
- 功能1：6am-midnight 时间网格
- 功能2："现在"红线指示器
- 功能3：任务块按 scheduled_start/end 或估算时间定位
- 功能4：未排期任务自动排布
- 功能5：点击切换完成状态

### 关键文件
- `features/todos/components/today-gantt.tsx`
- `features/todos/hooks/use-today-todos.ts`

### 测试描述
- 输入：输入 /today-todo
- 输出：甘特图显示今日任务，有时间的任务显示在正确位置

---

## gene_settings_editor
### 功能描述
/settings 命令触发的设置编辑器，由 JSON schema 驱动界面生成。

### 详细功能
- 功能1：JSON schema 定义设置项（类型、选项、默认值）
- 功能2：自动生成 toggle/select/number 控件
- 功能3：设置保存到本地配置（LocalSettings）
- 功能4：主题切换实时生效

### 关键文件
- `features/settings/components/settings-editor.tsx`
- `features/settings/lib/settings-schema.json`
- `shared/lib/local-config.ts`

### 测试描述
- 输入：输入 /settings → 切换主题为 dark
- 输出：界面即时切换为深色主题，设置持久化

---

## gene_skills_management
### 功能描述
全屏技能管理页面，替代侧边栏内嵌面板。技能配置存储在本地。

### 详细功能
- 功能1：全屏 overlay 展示技能列表
- 功能2：Switch 开关启用/停用技能
- 功能3：折叠展开查看技能 prompt
- 功能4：本地存储技能配置（首次从服务器迁移）
- 功能5：发送录音时附带本地技能配置

### 关键文件
- `features/skills/components/skills-page.tsx`
- `shared/lib/local-config.ts`（LocalSkills）
- `shared/lib/api/skills.ts`

### 测试描述
- 输入：打开技能管理 → 关闭某技能 → 重新录音
- 输出：仅启用的技能参与 AI 处理

---

## gene_profile_editor
### 功能描述
Soul/用户画像/工具配置编辑器。三个 tab 页分别编辑 AI 画像、用户信息和 MCP 工具配置。

### 详细功能
- 功能1：Soul tab — 编辑 AI 用户画像文本
- 功能2：User tab — 编辑用户名称、简介、特征标签
- 功能3：Tools tab — JSON 编辑器配置 MCP 工具服务器
- 功能4：首次加载从服务器迁移数据到本地
- 功能5：保存到本地配置

### 关键文件
- `features/profile/components/profile-editor.tsx`
- `shared/lib/local-config.ts`

### 测试描述
- 输入：打开画像编辑 → 修改 soul 内容 → 保存
- 输出：后续 AI 处理使用新的 soul 内容

---

## gene_tag_system
### 功能描述
标签管理系统。AI 处理时仅从已有标签中匹配，不再创建新标签。Header 标签筛选 UI 已移除。

### 详细功能
- 功能1：标签存储在数据库 tag 表
- 功能2：AI 处理时通过 existingTags 列表限制标签选择
- 功能3：gateway tagRepo.findByName() 查询而非 upsert()
- 功能4：NoteDetail 中仍可手动编辑标签
- 功能5：标签同步到本地和服务器

### 关键文件
- `gateway/src/db/repositories/tag.ts`
- `features/tags/hooks/use-tags.ts`
- `features/tags/lib/tag-manager.ts`

### 测试描述
- 输入：录音提到"工作"（已有标签）和"新标签"（不存在）
- 输出：仅关联"工作"标签，不创建"新标签"

---

## gene_note_detail
### 功能描述
笔记详情与编辑页面。展示录音转写、摘要、标签、待办等完整信息。

### 详细功能
- 功能1：全屏 overlay 展示笔记详情
- 功能2：音频回放（迷你播放器）
- 功能3：标签编辑（添加/删除）
- 功能4：待办事项管理
- 功能5：文本编辑器（markdown）

### 关键文件
- `features/notes/components/note-detail.tsx`
- `features/notes/components/note-card.tsx`
- `features/notes/components/mini-audio-player.tsx`
- `features/notes/components/text-editor.tsx`
- `features/notes/hooks/use-note-detail.ts`

### 测试描述
- 输入：点击笔记卡片
- 输出：显示完整笔记详情，可编辑标签和待办

---

## gene_search
### 功能描述
全文搜索功能。通过 /search 命令或 Header 搜索入口打开。

### 详细功能
- 功能1：关键词搜索笔记标题和内容
- 功能2：搜索结果高亮
- 功能3：点击结果跳转到笔记详情

### 关键文件
- `features/search/components/search-view.tsx`
- `features/search/hooks/use-search.ts`

### 测试描述
- 输入：搜索关键词 "会议"
- 输出：显示包含"会议"的笔记列表

---

## gene_review_chat
### 功能描述
复盘对话功能。基于时间范围内的录音记录，与 AI 进行复盘对话。

### 详细功能
- 功能1：选择日期范围启动复盘
- 功能2：加载范围内录音转写和记忆
- 功能3：流式 AI 对话
- 功能4：对话结束后更新 soul

### 关键文件
- `features/chat/components/chat-view.tsx`
- `features/chat/hooks/use-chat.ts`
- `gateway/src/handlers/chat.ts`
- `features/reviews/components/review-overlay.tsx`

### 测试描述
- 输入：/review 上周
- 输出：打开复盘对话，AI 基于上周记录进行对话

---

## gene_mcp_integration
### 功能描述
MCP（Model Context Protocol）工具接入。Gateway 作为 MCP Client 连接外部工具服务器。

### 详细功能
- 功能1：MCPClient — JSON-RPC 2.0 客户端（支持 stdio/HTTP transport）
- 功能2：MCPRegistry — 管理多个 MCP 服务器连接
- 功能3：工具描述注入 system prompt
- 功能4：AI 返回 tool_calls 时自动执行工具调用循环（最多 3 轮）
- 功能5：从 LocalConfig 工具配置解析 MCP 服务器

### 关键文件
- `gateway/src/mcp/client.ts` — MCP 客户端
- `gateway/src/mcp/registry.ts` — 服务器注册表
- `gateway/src/mcp/config-parser.ts` — 配置解析
- `gateway/src/skills/prompt-builder.ts` — 工具描述注入

### 测试描述
- 输入：配置日历 MCP 服务器 → 录音 "明天的日程是什么"
- 输出：AI 调用日历工具 → 返回日程信息

---

## gene_proactive_ai
### 功能描述
AI 主动提醒。通过 WebSocket 推送 toast 通知，提醒用户管理待办时间。

### 详细功能
- 功能1：ProactiveEngine 定期检查已连接设备的待办状态
- 功能2：检测未安排时间的待办 → 提醒安排
- 功能3：检测超时待办 → 催促处理
- 功能4：WebSocket 消息类型：proactive.message / proactive.todo_nudge
- 功能5：前端 NudgeToastListener 监听并显示 toast
- 功能6：toast 支持快捷操作按钮

### 关键文件
- `gateway/src/proactive/engine.ts` — 推送引擎
- `features/proactive/components/nudge-toast.tsx` — toast 监听组件

### 测试描述
- 输入：创建无时间待办 → 等待 30 分钟
- 输出：收到 toast 提醒 "你有 N 项待办还没有安排时间"

---

## gene_time_management
### 功能描述
待办时间估算与智能排程。AI 自动估算待办完成时间，智能建议时间安排。

### 详细功能
- 功能1：todo 表新增字段：estimated_minutes, scheduled_start, scheduled_end, priority, completed_at
- 功能2：AI 时间估算（单个和批量）
- 功能3：智能排程器（基于优先级和空闲时段分配时间）
- 功能4：完成标记自动记录 completed_at

### 关键文件
- `gateway/src/proactive/time-estimator.ts` — AI 时间估算
- `gateway/src/proactive/scheduler.ts` — 智能排程
- `gateway/src/db/repositories/todo.ts` — 扩展 CRUD
- `supabase/migrations/007_time_management.sql` — 数据库迁移

### 测试描述
- 输入：录音创建待办 "写项目报告"
- 输出：自动估算 estimated_minutes=60, priority=4

---

## gene_local_config
### 功能描述
本地配置存储层。用户个性化数据（soul、skills、tools、settings）存储在设备本地。

### 详细功能
- 功能1：类型化 get/set 函数（LocalSoul, LocalUser, LocalTools, LocalSkills, LocalSettings）
- 功能2：跨平台存储（Capacitor Preferences / localStorage）
- 功能3：发送录音/聊天时附带 localConfig
- 功能4：首次加载从服务器迁移现有数据
- 功能5：Gateway 优先使用 localConfig，回退到 DB

### 关键文件
- `shared/lib/local-config.ts` — 本地配置存储
- `shared/lib/storage.ts` — 底层存储抽象
- `gateway/src/handlers/process.ts` — localConfig 字段处理
- `gateway/src/handlers/chat.ts` — localConfig 字段处理

### 测试描述
- 输入：在技能页面关闭某技能 → 录音
- 输出：Gateway 使用本地技能配置，被关闭的技能不参与处理

---

## gene_sync
### 功能描述
数据同步。本地数据与服务器之间的同步机制。

### 详细功能
- 功能1：设备注册和身份管理
- 功能2：笔记/待办/灵感通过 REST API 同步
- 功能3：标签同步（fire-and-forget）

### 关键文件
- `features/workspace/lib/sync.ts`
- `shared/lib/api/*.ts`
- `gateway/src/routes/sync.ts`

### 测试描述
- 输入：离线创建笔记 → 恢复网络
- 输出：数据自动同步到服务器

---

## gene_offline
### 功能描述
离线支持。网络断开时显示离线横幅，本地操作继续可用。

### 详细功能
- 功能1：OfflineBanner 组件显示网络状态
- 功能2：本地配置和缓存数据离线可用
- 功能3：WebSocket 自动重连（3 秒间隔）

### 关键文件
- `shared/components/offline-banner.tsx`
- `shared/hooks/use-network.ts`
- `features/chat/lib/gateway-client.ts`

### 测试描述
- 输入：断开网络
- 输出：显示离线横幅，本地浏览功能正常
