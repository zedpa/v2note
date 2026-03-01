# v2note 基因库

每个基因片段 = 一个独立功能模块。修改代码前先更新基因描述，再生成代码。

---

## 版本记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v2026.03.01f | 2026-03-01 | react-markdown v9兼容修复：className prop已被移除，改为外层div包裹（修复命令模式/复盘/AI画像等所有MarkdownContent使用处崩溃） |
| v2026.03.01e | 2026-03-01 | 搜索结果修复：(1)搜索API返回summary+tags数据（之前只返回record原始字段，导致搜索结果无标题无内容）；(2)前端use-search.ts正确映射tags字段 |
| v2026.03.01d | 2026-03-01 | 指令模式修复3项：(1)disconnect改为同步避免与connect竞态；(2)”/”引导模式新增sessionStartedRef——send()自动补发chat.start解决”No active chat session”；(3)connectGenRef防止旧异步回调覆盖新连接状态 |
| v2026.03.01c | 2026-03-01 | UX走查11项问题全部修复：(1)搜索路由顺序修正；(2)复盘/聊天markdown渲染（react-markdown）；(3)文字笔记详情隐藏冗余转录原文；(4)复盘列表卡片strip markdown预览；(5)详情页新增删除按钮；(6)AI画像markdown渲染；(7)AI记忆页添加编辑引导提示；(8)复盘ISO日期转中文格式；(9)”/”命令列表可点击chip；(10)笔记卡片语音/文字类型标识；(11)工具配置JSON实时校验 |
| v2026.03.01b | 2026-03-01 | UX走查发现11项体验问题（详见下方 UX Issues Backlog） |
| v2026.03.01 | 2026-03-01 | 命令系统修复5项：(1)”/”命令列表不再被Gateway连接阻塞，离线也能立即显示；(2)ChatView中输入”/todos”等命令可本地路由到对应overlay；(3)/skills路由到复盘界面（技能面板集成在此）；(4)侧边栏”命令帮助/导出/订阅/关于”添加onClick；(5)WebSocket重连改为指数退避+最大10次 |
| v2026.02.28c | 2026-02-28 | 命令模式增强：输入”/”进入命令对话时前端直接返回本地命令列表（无需等待AI流式回复）；聊天链路增加连接就绪等待、消息排队与超时兜底，避免长时间 loading；本地联调环境默认WS改回 `ws://localhost:3001` |
| v2026.02.28b | 2026-02-28 | 录音UI精修：recording阶段去除全屏渐变背景与底部三色标签，改为玻璃态波形卡+动态方向胶囊提示；locked常驻录音界面重做层次与按钮样式；前端WS默认fallback改为远程 `ws://47.99.68.126:3001` |
| v2026.02.28 | 2026-02-28 | AI转写替代AI摘要：prompt改为仅去填充词+修错别字、严格保留原文句式结构；UI标签"AI摘要"→"AI转写"；ChatBubble内容双重渲染修复；技能面板合并逻辑（本地新增skill不被远程API覆盖） |
| v2026.02.27e | 2026-02-27 | 新增二阶思考skill；修复chat模式skill选择不生效bug（chat.ts读取localConfig skill配置，use-chat.ts发送localConfig） |
| v2026.02.27d | 2026-02-27 | 交互修复：FAB点击闪退bug修复(pointerdown preventDefault阻止click穿透backdrop)；移除录音阶段三色方向提示块；ChatBubble消息内容双重渲染修复；命令模式AI行为约束(仅修改设置,实事求是不承诺做不到的事) |
| v2026.02.26d | 2026-02-26 | 录音交互优化：长按录音态新增三向拖拽渐变引导（左红取消/上橙指令/右绿常驻）；上滑松手进入语音指令模式（不新增日记）；右滑松手进入常驻录音界面；常驻界面改为中间方块暂停/继续，暂停后左X取消、右✓完成 |
| v2026.02.27c | 2026-02-27 | Bug修复2：recording阶段不再进入全屏(只有locked才全屏)→恢复松开发送；全屏背景立即显示(不用opacity动画)→chips不再浮在内容上；chips移到屏幕中部(25%处)而非顶部；TextBottomSheet focus改为autoFocus→修复Android键盘不弹出 |
| v2026.02.27b | 2026-02-27 | Bug修复：三色块贴状态栏无法点击→最小top 64px；TextBottomSheet手机不显示→条件渲染+动画；Android IME导致/匹配失败→正则修复；chat.start先于"/"消息触发复盘→command模式跳过复盘；Toast侵入状态栏→bottom-center+offset |
| v2026.02.27 | 2026-02-27 | UI 优化：FAB 图标放大+上移30px；全屏沉浸录音三色块交互；输入框键盘吸附修复；/命令进入流式对话模式 |
| v2026.02.25 | 2026-02-25 | 日记删除/复盘功能 |
| v2026.02.22 | 2026-02-22 | 安卓侧滑返回修复 |
| v2026.02.20 | 2026-02-20 | v6 基因架构重构 |

---

## UX Issues Backlog (v2026.03.01 走查) — 已全部修复 (v2026.03.01c)

以下问题按严重程度排序，来源为完整用户视角UI走查。全部已在 v2026.03.01c 修复。

### P0 — 功能性问题（阻断核心流程）

| # | 问题 | 状态 | 修复内容 |
|---|------|------|----------|
| 1 | **搜索完全失效** | ✅ 已修复 | `gateway/src/routes/records.ts` 搜索路由移至 `/:id` 之前注册 |

### P1 — 体验严重缺陷（影响核心使用感受）

| # | 问题 | 状态 | 修复内容 |
|---|------|------|----------|
| 2 | **复盘结果markdown未渲染** | ✅ 已修复 | 新增 `shared/components/markdown-content.tsx`（react-markdown + Tailwind样式），用于 `review-result.tsx` 和 `chat-bubble.tsx`（仅assistant消息） |
| 3 | **文字笔记详情页冗余** | ✅ 已修复 | `note-detail.tsx` 判断 `duration_seconds==null||0` 为文字笔记，隐藏"转录原文"区块，标签改为"笔记内容" |
| 4 | **历史复盘卡片markdown未清理** | ✅ 已修复 | `review-list.tsx` 使用 `stripMarkdown()` 清理预览文本中的 `#`、`**`、`|` 等标记 |
| 5 | **详情页无删除入口** | ✅ 已修复 | `note-detail.tsx` header新增Trash2删除按钮，confirm确认后调用 `api.delete`，新增 `onDeleted` 回调 |

### P2 — 体验粗糙（影响专业感和信任感）

| # | 问题 | 状态 | 修复内容 |
|---|------|------|----------|
| 6 | **AI画像显示原始markdown围栏** | ✅ 已修复 | `soul-tab.tsx` 使用 `<MarkdownContent>` 渲染画像内容 |
| 7 | **AI记忆与个人画像内容重复** | ✅ 已修复 | `memory-soul-overlay.tsx` 在画像tab顶部添加"完整编辑请前往 侧边栏→个人画像"引导提示 |
| 8 | **复盘结果中显示ISO日期格式** | ✅ 已修复 | `review-result.tsx` 新增 `cleanDates()` 将ISO日期正则替换为 `toLocaleString("zh-CN")` 中文格式 |
| 9 | **命令列表不可点击** | ✅ 已修复 | `chat-view.tsx` 检测命令列表消息后渲染可点击command chip按钮，点击自动发送命令 |
| 10 | **笔记卡片无类型标识** | ✅ 已修复 | `notes-timeline.tsx` 根据 `duration_seconds` 显示 Mic+时长（语音）或 Type+"文字"（文字笔记） |
| 11 | **工具配置要求手写JSON** | ✅ 已修复 | `profile-editor.tsx` 新增实时JSON格式校验提示 + 更友好的placeholder示例 |

---

## gene_voice_recording
### 功能描述
语音录制与实时 ASR 转写。用户通过 FAB 按钮长按录音，PCM 音频流通过 WebSocket 发送到 Gateway，Gateway 连接阿里云 DashScope 实时语音识别服务。

### 录音阶段（两阶段设计）
- **recording 阶段**（长按开始）：FAB 保持可见，周围显示红色脉冲圆环；FAB 上方显示迷你波形 + 计时；支持三向拖拽手势（左取消 / 上指令 / 右常驻），无三色方向提示。指针捕获（setPointerCapture）确保滑动手势在 FAB 外也能追踪；pointerdown 调用 preventDefault 防止后续 click 穿透
- **locked 阶段**（右滑锁定）：进入全屏常驻录音界面（RecordingImmersive），中间方块按钮负责暂停/继续

### 详细功能
- 功能1：FAB 按钮手势控制（长按开始录音，松开立即发送，左滑/左上取消，右滑/右上锁定，正上滑松手转语音指令）
- 功能2：PCM 音频采集（Web Audio API worklet），实时计算 RMS 音量
- 功能3：WebSocket 二进制帧传输 PCM 数据
- 功能4：Gateway 连接 DashScope Realtime ASR
- 功能5：实时转写文本回传（partial + sentence 事件）
- 功能6：录音完成后创建 record + transcript，触发 AI 处理
- 功能7：全屏常驻录音界面（仅 locked 阶段）——中间方块按钮点击可暂停/继续；暂停后左侧显示 X（取消录音），右侧显示 ✓（完成录音）
- 功能8：上滑语音指令模式——上滑松手后仅做转写并进入命令执行流程（不创建日记）
- 功能9：音量响应声波可视化（中央波形随实际音量大小动态变化）

### 关键文件
- `features/recording/components/fab.tsx` — FAB 组件（图标放大，位置上移30px）
- `features/recording/components/recording-immersive.tsx` — 全屏沉浸录音（三色块 + 音量波形）
- `features/recording/hooks/use-pcm-recorder.ts` — PCM 录音 hook
- `features/recording/hooks/use-fab-gestures.ts` — 手势 hook
- `gateway/src/handlers/asr.ts` — ASR 处理器
- `public/worklets/pcm-processor.js` — Web Audio worklet

### UI 规格（v2026.02.27d）
- FAB 按钮：`w-16 h-16`（64px），`bottom-[54px]`（上移30px）
- Mic 图标：`w-8 h-8`（32px）
- recording 阶段：仅显示波形+计时+拖拽提示气泡，无三色方向标签，无拖拽背景渐变
- locked 阶段中心控件：方块按钮常驻居中；暂停后两侧浮出 X / ✓ 操作按钮

### 测试描述
- 输入1：长按 FAB 后向右拖拽（或右上）并松手
- 输出1：进入常驻录音界面，中心方块可暂停/继续；暂停后可点 X 取消或 ✓ 完成
- 输入2：长按 FAB 后正上拖拽并松手
- 输出2：进入语音指令流程（不新增日记），转写文本直接用于指令执行
- 输入3：长按 FAB 后向左拖拽（或左上）并松手
- 输出3：录音取消

---

## gene_text_input
### 功能描述
文本输入与命令对话。TextBottomSheet 支持输入文字笔记，输入 / 立即进入流式命令对话模式（不再显示小型补全框）。

### 详细功能
- 功能1：自定义固定底部抽屉（取代 vaul Drawer，解决键盘跳位问题）
- 功能2：visualViewport API 监听键盘高度，输入框始终贴键盘上边沿
- 功能3：输入 "/" 后立即关闭输入框，进入流式 AI 指令对话（ChatView）
- 功能4：命令模式 AI 行为约束——AI 仅能根据用户指令修改设置（soul/memory/skills/settings），必须实事求是，不承诺自己做不到的功能，不编造能力
- 功能5：普通文本创建手动笔记（通过 API）
- 功能6：命令执行通过 registry 路由（非 / 前缀时保持原有逻辑）

### 关键文件
- `features/recording/components/text-bottom-sheet.tsx` — 自定义底部抽屉（keyboard-safe）
- `features/recording/components/fab.tsx` — 传递 onOpenCommandChat 回调
- `features/chat/components/chat-view.tsx` — 支持 initialMessage 自动发送
- `app/page.tsx` — 处理 onOpenCommandChat → 开启指令对话
- `features/notes/lib/manual-note.ts`

### UI 规格（v2026.02.27d）
- 底部抽屉：条件渲染 `{open && <div>}`，animate-slide-up-sheet（避免 translate-y-full 在 Android 不触发）
- 使用 visualViewport.resize 事件计算键盘偏移量 `bottom: ${bottomOffset}px`
- "/" 检测：正则 `/^\/\s*$/` 兼容 Android IME 尾随空格/换行
- "/" 触发 ChatView 时，通过 chat.start 中的 `mode:"command"+initialMessage` 直接响应，不先触发复盘
- FAB 点击防穿透：FAB 的 pointerdown 调用 `e.preventDefault()` 阻止浏览器生成 click 事件，避免 click 打到 backdrop 导致 sheet 闪退

### 测试描述
- 输入：点击 FAB → 输入 "/" → 立即跳转到 AI 对话界面
- 输出：AI 列出所有可用命令，用户可通过对话执行配置操作
- 输入：点击 FAB → 输入文字 → 回车
- 输出：创建普通笔记

---

## gene_ai_processing
### 功能描述
AI 处理管道。转写文本经过最小化清理（去填充词+修错别字，严格保留原文句式结构），按激活技能提取结构化数据（待办、客户要求等），标签仅匹配已有标签。基础人设由 Agent.md 定义，Soul 提供动态 AI 身份补充。

### 详细功能
- 功能1：转写清理（仅移除"嗯""那个""就是说"等填充词 + 修正错别字，不改写句式结构）
- 功能2：按技能提取 JSON 结构化数据
- 功能3：标签仅匹配已有标签列表，不创建新标签
- 功能4：生成 summary（清理后的转写文本，保留原文结构）并保存到 summary 表
- 功能5：MCP 工具调用循环（最多 3 轮）
- 功能6：结果写入数据库（todos、customer_requests、setting_changes、tags、summary）
- 功能7：后台触发时间估算和记忆更新
- 功能8：Agent.md 静态人设 + Soul 动态 AI 身份定义注入 system prompt

### 转写清理规则（v2026.02.28）
- 移除口语填充词和重复词
- 修正明显的错别字和语音识别错误
- **严格保留原文表述结构**：短句还是短句，倒装还是倒装
- 不将口语转为书面语，不合并或拆分句子
- 无填充词且无错别字时，转写结果应与原文完全一致

### 关键文件
- `gateway/src/handlers/process.ts` — 处理入口
- `gateway/src/skills/prompt-builder.ts` — 系统 prompt 构建（含转写清理规则）
- `gateway/src/skills/loader.ts` — 技能加载
- `gateway/src/skills/types.ts` — 技能类型
- `gateway/Agent.md` — 静态 AI 行为逻辑定义
- `gateway/src/soul/manager.ts` — AI 身份定义更新

### 测试描述
- 输入：口语化文本 "嗯那个明天要开会啊然后就是说下午三点"
- 输出：summary = "明天要开会，下午三点"（仅去填充词，保留原文句式）
- 输入：无填充词文本 "现在这个录音怎么没有用呢？"
- 输出：summary = "现在这个录音怎么没有用呢？"（与原文完全一致）

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
技能管理面板，集成在复盘界面中（可折叠区域）。技能配置存储在本地。已从侧边栏移除独立入口。

### 详细功能
- 功能1：复盘界面中可折叠的技能开关区域
- 功能2：Switch 开关启用/停用技能
- 功能3：折叠展开查看技能 prompt
- 功能4：本地存储技能配置（首次从服务器迁移）
- 功能5：发送录音时附带本地技能配置

### 关键文件
- `features/sidebar/components/skills-panel.tsx` — 技能面板组件
- `features/reviews/components/review-overlay.tsx` — 集成技能面板
- `shared/lib/local-config.ts`（LocalSkills）
- `shared/lib/api/skills.ts`

### 测试描述
- 输入：打开复盘 → 展开技能开关 → 关闭某技能 → 生成复盘
- 输出：仅启用的技能参与 AI 处理

---

## gene_profile_editor
### 功能描述
AI 身份定义/用户信息/工具配置编辑器。三个 tab 页分别编辑 AI 身份定义（Soul）、用户信息和 MCP 工具配置。

### 详细功能
- 功能1：Soul tab — 编辑 AI 身份定义文本（用户对 AI 的要求、行为准则、交互风格）
- 功能2：User tab — 编辑用户名称、简介、特征标签
- 功能3：Tools tab — JSON 编辑器配置 MCP 工具服务器，实时JSON格式校验（绿色/红色提示）
- 功能4：首次加载从服务器迁移数据到本地
- 功能5：保存到本地配置

### 关键文件
- `features/profile/components/profile-editor.tsx`
- `shared/lib/local-config.ts`

### 测试描述
- 输入：打开画像编辑 → 修改 AI 身份定义 → 保存
- 输出：后续 AI 处理使用新的 AI 身份定义
- 输入：工具配置tab → 输入无效JSON
- 输出：实时显示"JSON格式错误"红色提示

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
笔记详情与编辑页面。展示录音转写、摘要、标签、待办等完整信息。支持单条删除。

### 详细功能
- 功能1：全屏 overlay 展示笔记详情
- 功能2：音频回放（迷你播放器）
- 功能3：标签编辑（添加/删除）
- 功能4：待办事项管理
- 功能5：文本编辑器（markdown）
- 功能6：单条删除按钮（header Trash2图标，confirm确认后调用 `api.delete`）
- 功能7：文字笔记智能显示——`duration_seconds==null||0` 判定为文字笔记，隐藏"转录原文"区块，"AI转写"标签改为"笔记内容"

### 关键文件
- `features/notes/components/note-detail.tsx`
- `features/notes/components/note-card.tsx`
- `features/notes/components/mini-audio-player.tsx`
- `features/notes/components/text-editor.tsx`
- `features/notes/hooks/use-note-detail.ts`

### 测试描述
- 输入：点击笔记卡片
- 输出：显示完整笔记详情，可编辑标签和待办
- 输入：点击详情页删除按钮 → 确认
- 输出：笔记删除，返回时间线
- 输入：打开文字笔记详情
- 输出：不显示"转录原文"区块，标签为"笔记内容"

---

## gene_multiselect_delete
### 功能描述
笔记时间线长按多选与批量删除。长按卡片进入选择模式，底部工具栏提供删除操作。笔记卡片显示语音/文字类型标识。

### 详细功能
- 功能1：500ms 长按触发选择模式
- 功能2：选择模式下点击切换选中状态
- 功能3：选中卡片高亮 + CheckCircle 图标
- 功能4：底部固定工具栏（已选计数、取消、删除）
- 功能5：批量删除调用 useNotes().deleteNotes()
- 功能6：选择模式下隐藏音频播放器避免误触
- 功能7：语音/文字类型标识——根据 `duration_seconds` 判断，语音笔记显示 Mic图标+时长，文字笔记显示 Type图标+"文字"

### 关键文件
- `features/notes/components/notes-timeline.tsx` — 时间线组件（选择逻辑 + 工具栏 + 类型标识）
- `features/notes/hooks/use-notes.ts` — deleteNotes 方法

### 测试描述
- 输入：长按日记卡片 → 选中多条 → 点击删除
- 输出：进入选择模式 → 显示选中计数 → 删除后退出选择模式
- 输入：查看时间线
- 输出：语音笔记显示麦克风图标+录音时长，文字笔记显示文字图标

---

## gene_search
### 功能描述
全文搜索功能。通过 /search 命令或 Header 搜索入口打开。

### 详细功能
- 功能1：关键词搜索笔记标题和内容（ILIKE匹配transcript.text、summary.title、summary.short_summary）
- 功能2：搜索结果包含完整summary和tags数据（与列表API一致的batch load模式）
- 功能3：点击结果跳转到笔记详情

### 路由注意事项
- Gateway路由注册顺序：`/api/v1/records/search` 必须在 `/api/v1/records/:id` 之前注册（`gateway/src/routes/records.ts`），否则 "search" 会被当作 `:id` 参数匹配导致搜索失效
- 搜索路由必须batch load summaries和tags（通过summaryRepo、tagRepo），不能只返回record原始字段，否则前端无法显示标题和内容

### 关键文件
- `features/search/components/search-view.tsx` — 搜索UI，使用NoteCard展示结果
- `features/search/hooks/use-search.ts` — 搜索hook，映射API结果为NoteItem（含tags字段映射）
- `gateway/src/routes/records.ts` — 搜索路由（注意注册顺序 + summary/tags batch load）
- `gateway/src/db/repositories/record.ts` — search()方法（SELECT DISTINCT r.*）

### 测试描述
- 输入：搜索关键词 "会议"
- 输出：显示包含"会议"的笔记列表，每条结果显示标题、摘要、标签

---

## gene_review_chat
### 功能描述
复盘对话功能。基于时间范围内的录音记录，与 AI 进行复盘对话。日期选择简化为 4 个快捷按钮，集成技能开关。

### 详细功能
- 功能1：4 个日期快捷按钮（近7天、近1月、近半年、全部日记），点击直接生成
- 功能2：加载范围内录音转写和记忆
- 功能3：流式 AI 对话（ChatBubble 消息气泡，用户右对齐 / AI 左对齐，内容三元渲染避免重复）；assistant消息使用MarkdownContent渲染
- 功能4：对话结束后更新 soul（AI 身份定义）
- 功能5：可折叠技能开关面板（生成前调整技能）
- 功能6：历史复盘列表（preview使用stripMarkdown清理markdown标记）
- 功能7：命令模式约束——Gateway chat.ts 命令模式 system prompt 明确告知 AI：仅能修改 soul/memory/skills/settings，实事求是，不承诺做不到的能力
- 功能8：chat.start 发送 localConfig（含技能开关配置），Gateway chat.ts 用 filterActiveSkills 过滤，用户的技能开关在复盘对话中生效
- 功能9：技能面板合并策略——服务端返回的技能优先，本地 DEFAULT_SKILLS 中服务端未知的技能追加保留
- 功能10：复盘结果使用MarkdownContent渲染 + cleanDates()将ISO日期转中文格式
- 功能11："/"命令列表可点击——ChatView检测到命令列表消息后渲染command chip按钮，点击先尝试本地命令执行再发送到gateway
- 功能12：指令模式会话管理——`sessionStartedRef` 跟踪gateway会话状态，"/"引导模式下send()自动补发chat.start；`connectGenRef` 防止旧异步回调覆盖新连接；disconnect改为同步（fire-and-forget chat.end）避免与connect竞态

### 关键文件
- `features/chat/components/chat-view.tsx` — 含命令chip渲染
- `features/chat/components/chat-bubble.tsx` — assistant消息MarkdownContent
- `features/chat/hooks/use-chat.ts`
- `features/reviews/components/review-result.tsx` — MarkdownContent + cleanDates
- `features/reviews/components/review-list.tsx` — stripMarkdown预览
- `shared/components/markdown-content.tsx` — 共享markdown渲染+stripMarkdown工具
- `gateway/src/handlers/chat.ts`
- `features/reviews/components/review-overlay.tsx` — 复盘主界面
- `features/reviews/components/date-selector.tsx` — 快捷日期选择

### 测试描述
- 输入：打开复盘 → 点击"近7天"
- 输出：直接生成复盘，AI 基于近 7 天记录进行对话，markdown格式正确渲染
- 输入："/"命令模式 → 命令列表显示
- 输出：每个命令显示为可点击chip按钮

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

---

## gene_second_order_thinking
### 功能描述
二阶思考技能。在复盘对话中引导 AI 分析用户记录中"问题背后的问题"，帮助用户看到盲点。纯行为引导 skill，无 extract_fields，不影响 process 管道。

### 详细功能
- 功能1：识别表层问题 — 用户在说什么事、遇到什么困难或决策
- 功能2：追问根因 — 分析系统性因素（资源、流程、认知、关系、优先级）
- 功能3：发现隐含假设 — 挖掘用户描述中未被质疑的假设
- 功能4：输出洞察 — 用 1-2 句话点出"问题之上的问题"
- 功能5：智能判断 — 流水账/日常记录不强行深度解读

### 关键文件
- `gateway/skills/second-order-thinking/SKILL.md` — 技能定义
- `features/sidebar/components/skills-panel.tsx` — 技能面板（包含默认开关）

### 测试描述
- 输入：开启二阶思考 → 复盘包含 "项目又延期了" 的记录
- 输出：AI 回复中包含深层洞察，如 "反复延期可能是估算习惯或范围管理机制缺失"
- 输入：关闭二阶思考 → 复盘同样记录
- 输出：AI 正常复盘，不做二阶分析
- 输入：开启二阶思考 → 复盘 "今天买了杯咖啡" 的记录
- 输出：AI 正常回复，不强行生成洞察
