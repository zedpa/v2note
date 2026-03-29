# v2note 前后端功能对照清单

> 更新日期：2026-03-26
> 用途：确保前端 UI 覆盖所有后端能力，避免功能遗漏

---

## 整体架构

```
工作区（主屏幕）
├── 日记视图 ←→ 待办视图（Segment 切换）
├── FAB 录音按钮（常驻底部）
└── 顶部栏：头像(侧边栏) + Segment + 🔍 + 🔔

侧边栏（左侧 3/4 覆盖）
├── 搜索
├── 每日回顾 / 发现 / 认知统计
├── 我的目标（项目+独立目标+AI建议）
├── 洞察视角 / 路路设置 / 设置
└── 退出登录

侧边栏导航页（push 进工作区，← 返回）
├── 目标详情页
├── 发现/认知地图
├── 每日回顾
├── 认知统计
├── 路路设置（AI身份/记忆/技能）
└── 设置（画像/通知/导出）
```

---

## 功能对照表

### 一、日记（认知输入）

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| 日记列表 | `GET /records` | 工作区·日记视图（按日期分组卡片流） | ✅ |
| 日记详情 | `GET /records/:id` | 日记卡片点击展开（摘要+转录+待办+Strike+关联） | ✅ |
| 日记搜索 | `GET /records/search?q=` | 顶部 🔍 搜索 | ✅ |
| 创建文本日记 | `POST /records/manual` | FAB 长按上滑 → 文字输入 Sheet → 发送 | ✅ |
| 语音录制+ASR | WS `asr.start/stop` + PCM | FAB 点击 → 录音 Sheet；长按拖 → 全屏沉浸 | ✅ |
| 多模态输入 | `POST /ingest` (text/image/file/url) | 输入 Sheet 📎 附件按钮（拍照/相册/文件/URL） | ✅ |
| source_type 切换 | `PATCH /records/:id/source-type` | 日记卡片展开态 🧠思考/📄素材 pill 标签 | ✅ |
| 日记删除 | `DELETE /records` (batch) | 日记卡片长按多选 → 批量删除 | ✅ |
| 日记更新 | `PATCH /records/:id` | 日记卡片编辑（short_summary 等） | ✅ |
| 音频播放 | `GET /records/:id/audio` | 日记卡片展开态 ▶ 音频播放器 | ✅ |
| 标签管理 | `GET /tags`, `POST/DELETE /records/:id/tags` | 日记卡片主题标签（药丸样式，可长按删除） | ✅ |
| 笔记本筛选 | `GET /records?notebook=` | 侧边栏项目点击 → 筛选该项目日记 | ✅ |

### 二、Strike 认知图谱

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| Strike 列表 | `GET /records/:id/strikes` | 日记卡片展开态"Strike"区（极性图标+nucleus） | ✅ |
| Strike 纠错 | `PATCH /strikes/:id` | Strike 行 [纠正] 按钮 | ✅ |
| Strike 溯源 | `GET /strikes/:id/trace` | Strike 点击 → 溯源链（来源记录+Bond+Cluster） | ✅ |
| 相关记录 | `GET /records/:id/related` | 日记卡片展开态"关联记录"区 | ✅ |
| 手动 Bond | `POST /cognitive/bonds` | 认知地图长按节点拖线到另一节点 | ✅ |

### 三、待办（行动执行）

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| 待办列表 | `GET /todos` | 工作区·待办视图（按今日/明天/稍后分组） | ✅ |
| 创建待办 | `POST /todos` | 待办视图 FAB 语音 / "添加待办"按钮 | ✅ |
| 更新待办 | `PATCH /todos/:id` | 点击圆圈完成；点击文字展开编辑（调度/时长/优先级） | ✅ |
| 删除待办 | `DELETE /todos/:id` | 待办详情左滑删除 | ✅ |
| 待确认意图 | `GET /intents/pending` | 待办视图顶部"待确认"卡片（确认→创建 goal） | ✅ |
| 转达追踪 | `GET /daily/relays` | 待办视图"转达"区（📞/📧 + 完成标记） | ✅ |
| 转达完成 | `PATCH /daily/relays/:id` | 点击转达项标记完成 | ✅ |
| 行动面板 | `GET /action-panel` | 待办视图（今日行动排序=行动面板计算结果） | ✅ |
| 滑动行为记录 | `POST /action-panel/swipe` | 待办左滑跳过时上报原因 | ✅ |
| 行动事件 | `POST /action-panel/event` | 完成/跳过时上报 | ✅ |

### 四、目标管理

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| 目标列表 | `GET /goals` | 侧边栏"我的目标"（项目→目标嵌套） | ✅ |
| 创建目标 | `POST /goals` | 侧边栏 + 按钮 / AI 对话中 create_goal 工具 | ✅ |
| 更新目标 | `PATCH /goals/:id` | 目标详情页编辑 | ✅ |
| 目标待办 | `GET /goals/:id/todos` | 目标详情页"待办"列表 | ✅ |
| 目标健康度 | `GET /goals/:id/health` | 目标详情页四维条（方向/资源/路径/驱动） | ✅ |
| 目标时间线 | `GET /goals/:id/timeline` | 目标详情页"认知叙事"（起点/转折/冲突/悬念） | ✅ |
| 确认建议目标 | `POST /goals/:id/confirm` | 侧边栏"💡路路建议"→ 确认按钮 | ✅ |
| 归档目标 | `POST /goals/:id/archive` | 目标详情页 ··· 菜单 → 归档 | ✅ |

### 五、笔记本/项目

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| 笔记本列表 | `GET /notebooks` | 侧边栏"我的目标"下项目列表（📁图标） | ✅ |
| 创建笔记本 | `POST /notebooks` | 侧边栏 + 按钮 / AI 对话中 create_project 工具 | ✅ |
| 更新笔记本 | `PATCH /notebooks/:id` | 项目详情编辑 | ✅ |
| 删除笔记本 | `DELETE /notebooks/:id` | 项目 ··· 菜单 → 删除 | ✅ |

### 六、认知地图

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| Cluster 列表 | `GET /cognitive/clusters` | 侧边栏"发现"→ 认知地图（卡片墙/网状/导图） | ✅ |
| Cluster 详情 | `GET /cognitive/clusters/:id` | 点击主题卡片 → push 详情页（模式+矛盾+时间线） | ✅ |
| 认知统计 | `GET /cognitive/stats` | 侧边栏"认知统计"→ push 页面 | ✅ |
| 决策工作台 | `POST /chat/decision` | Cluster 详情"帮我想想"→ 参谋对话(decision mode) | ✅ |

### 七、AI 交互

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| AI 追问 | WS `reflect.question` | 日记视图顶部 AI 伴侣气泡（🦌路路） | ✅ |
| AI 状态 | WS `ai.status` | AI 伴侣气泡默认态（个性化一句话） | ✅ |
| 参谋对话(review) | WS `chat.start` mode=review | "和路路聊聊这条" → 全屏对话页 | ✅ |
| 参谋对话(command) | WS `chat.start` mode=command | FAB 文字输入 "/" → 命令对话 | ✅ |
| 参谋对话(insight) | WS `chat.start` mode=insight | 侧边栏"洞察视角"选择技能→对话 | ✅ |
| 参谋对话(decision) | WS `chat.start` mode=decision | Cluster "帮我想想"→ 对话 | ✅ |
| 洞察技能 | insights/ 目录 (reflect/meta-question/second-order/munger) | 侧边栏"洞察视角"4种卡片选择 | ✅ |
| AI 内置工具 | create_todo/create_goal/update_todo/search 等 12+ | 参谋对话中 AI 自动调用 | ✅ |
| 路路发现 | 认知报告持久化结果 | 日记流中 AI 卡片（每日1-2张）+ 发现页洞察列表 | ✅ |

### 八、每日循环

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| 晨间简报 | `GET /daily/briefing` | 侧边栏"每日回顾"→ push 页面 / 🔔通知 | ✅ |
| 晚间总结 | `GET /daily/evening-summary` | 同上 | ✅ |
| 主动推送(晨间) | WS `proactive.morning_briefing` | 🔔通知中心 + AI 伴侣气泡 | ✅ |
| 主动推送(待办) | WS `proactive.todo_nudge` | 🔔通知中心 | ✅ |
| 主动推送(晚间) | WS `proactive.evening_summary` | 🔔通知中心 | ✅ |
| 主动推送(转达) | WS `proactive.relay_reminder` | 🔔通知中心 | ✅ |
| 认知报告 | daily-cycle → report.ts | 晨间/晚间回顾中注入 + 发现页洞察列表 | ✅ |

### 九、AI 人格与记忆

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| Soul 读取/更新 | `GET/PUT /soul` | 侧边栏"路路设置"→ AI 身份 Tab | ✅ |
| 用户画像 | `GET/PATCH /profile` | 设置 → 用户画像 | ✅ |
| 记忆列表 | `GET /memory` | 路路设置 → AI 记忆 Tab（列表+删改） | ✅ |
| 记忆删改 | `DELETE/PATCH /memory/:id` | 记忆列表 item 操作 | ✅ |
| AI 日记 | `GET /diary/:notebook/:date` | 路路设置 → AI 日记（高级功能） | ✅ |
| 技能管理 | `GET/POST/PATCH/PUT/DELETE /skills` | 路路设置 → 技能管理 Tab（CRUD+启停） | ✅ |

### 十、系统功能

| 后端功能 | API | 前端入口 | 状态 |
|---------|-----|---------|------|
| 用户注册 | `POST /auth/register` | 登录页 → 注册 Tab | ✅ |
| 用户登录 | `POST /auth/login` | 登录页 | ✅ |
| Token 刷新 | `POST /auth/refresh` | 自动（401时触发） | ✅ |
| 退出登录 | `POST /auth/logout` | 侧边栏底部"退出登录" | ✅ |
| 设备注册 | `POST /devices/register` | 启动时自动 | ✅ |
| 数据导出 | `GET /export?format=json/md/csv` | 设置 → 数据导出按钮 | ✅ |
| 数据同步 | `POST /sync/push`, `GET /sync/pull` | 后台自动（无显式 UI） | ✅ |
| OTA 更新 | `GET /releases/check` | 启动时静默检查；有更新弹窗 | ✅ |
| 冷启动引导 | `POST /onboarding/answer` | Onboarding 5问流程 | ✅ |
| 周统计 | `GET /stats/week` | 认知统计页 / 侧边栏概览 | ✅ |
| 用量统计 | `GET /stats/usage` | 设置页用量显示 | ✅ |
| 每日趋势 | `GET /stats/daily-trend` | 认知统计页（30天折线图） | ✅ |
| 标签分布 | `GET /stats/tag-distribution` | 认知统计页（Top 10 标签） | ✅ |
| 待办趋势 | `GET /stats/todo-trend` | 认知统计页（创建vs完成） | ✅ |

### 十一、后台认知引擎（无直接 UI，结果通过上述功能展示）

| 模块 | 触发 | 产出 → 前端展示 |
|------|------|----------------|
| clustering.ts | 每日 3:00 AM | Cluster → 认知地图卡片 |
| emergence.ts | 每日 3:00 AM | 跨 Cluster Bond → 地图连线 |
| l2-emergence.ts | L1 新增≥3时 | L2 Meta-Cluster → 地图上层节点 |
| contradiction.ts | 每日 3:00 AM | 矛盾 Bond → Cluster 详情"对立观点" |
| promote.ts | 每日 3:00 AM | 融合 Strike → superseded 标记 |
| maintenance.ts | 每日 3:00 AM | Bond/salience 衰减 → 活跃度变化 |
| tag-sync.ts | 每日 3:00 AM | Cluster 标签同步 → 日记卡片标签 |
| report.ts | 每日 3:00 AM | 认知报告 → 每日回顾+路路发现 |
| todo-projector.ts | Digest 后 | intend Strike → 待办自动创建 |
| goal-linker.ts | Digest 后 | 待办自动关联目标 |
| record-relations.ts | 按需 | 相关记录计算 → 日记展开态 |
| source-type-weight.ts | Digest/聚类 | material ×0.2 降权 → 涌现结果 |
| top-level.ts | L2 涌现后 | L3 顶层维度 → 认知地图最外层 |
| alerts.ts | 每日 | 认知警报 → 🔔通知 |

---

## 参谋对话入口汇总

| 入口位置 | 触发 | Chat mode | 预设上下文 |
|---------|------|-----------|-----------|
| 日记卡片"和路路聊聊这条" | 点击 | review | 该条记录内容 |
| 路路发现"详细了解" | 点击 | insight | 洞察报告 |
| Cluster "帮我想想" | 点击 | decision | 决策图谱(gatherDecisionContext) |
| 洞察视角选择后 | 选技能+日期 | insight | 选定 insight 技能 |
| 待办"让AI帮忙" | 点击 | command | 该待办的 action_plan |
| 目标"和路路讨论" | 点击 | review | 目标+健康度+时间线 |
| AI 追问气泡 | 点击 | review | 追问上下文(assistantPreamble) |
| FAB 文字 "/" 触发 | 输入 "/" | command | 无（自由命令） |

---

## 数据库迁移清单（截至 025）

| 编号 | 文件 | 内容 |
|-----|------|------|
| 017 | cognitive 四表 | strike, bond, strike_tag, cluster_member |
| 018 | source_type | record.source_type 字段 |
| 019 | onboarding | user_profile 扩展字段 |
| 020 | digest_retry | record.digest_attempts |
| 021 | unmet_request | unmet_request 表 |
| 022 | agent_plan | agent_plan 表 |
| 023 | strike_level | strike.level + strike.origin |
| 024 | todo_strike_bridge | (待实现) todo.strike_id + goal.cluster_id |
| 025 | goal_lifecycle | (待实现) goal 字段扩展 |



## 页面层级与导航结构

### 平台分流

```
访问 / (根路径)
├── viewport ≥ 768px → router.replace("/write") → PC 端
└── viewport < 768px → 移动端主页
```

### 移动端：状态驱动 overlay 模型

移动端不使用路由跳转，所有页面切换通过 `activeOverlay` 状态控制条件渲染。

```
app/page.tsx (移动端入口，唯一路由)
│
├── [门控层] 按优先级短路渲染，不进入主界面
│   ├── authLoading    → 全屏 Loading（鹿 Logo）
│   ├── !loggedIn      → LoginPage / RegisterPage（authMode 切换）
│   └── isFirstTime    → OnboardingSeed（冷启动 5 问）
│
├── [常驻层] 始终渲染，不受 overlay 影响
│   ├── SidebarDrawer        左滑侧边栏（75vw, max 320px）
│   │   └── 菜单项 → openOverlay() 触发各 overlay
│   ├── OfflineBanner        离线提示横幅
│   ├── UpdateDialog         版本更新弹窗
│   └── FAB                  录音悬浮按钮（底部常驻）
│
├── [工作区层] 主内容，tab 切换
│   ├── WorkspaceHeader      头像 | Segment(日记/待办) | 搜索 | 通知
│   └── main (左右滑动切换，80px 阈值)
│       ├── activeTab="diary" → NotesTimeline（语音日记流）
│       └── activeTab="todo"  → TodoWorkspaceView（待办 + NowCard）
│
├── [认知地图层] 独立状态控制（cognitiveMapOpen / selectedClusterId / decisionQuestion）
│   ├── LifeMap              认知地图（全屏力导向图）
│   ├── ClusterDetailView    聚类详情（从地图点选进入）
│   └── DecisionWorkspace    决策工作台（从聚类详情进入）
│
└── [Overlay 层] activeOverlay 状态驱动，同时只显示一个
    │
    ├── 信息类（全屏覆盖 + SwipeBack 右滑返回）
    │   ├── "search"            SearchView          搜索
    │   ├── "chat"              ChatView            AI 对话（review/command/insight 三模式）
    │   ├── "stats"             StatsDashboard      数据统计
    │   ├── "memory"            MemorySoulOverlay   记忆与灵魂
    │   ├── "review"            ReviewOverlay       回顾入口
    │   ├── "skills"            SkillsPage          技能管理
    │   ├── "profile"           ProfileEditor       用户画像编辑
    │   ├── "settings"          SettingsEditor      设置
    │   └── "notebooks"         NotebookList        笔记本列表
    │
    ├── 日报类（全屏覆盖 + SwipeBack）
    │   ├── "morning-briefing"  MorningBriefing     今日简报（7-10am 自动弹出）
    │   └── "evening-summary"   EveningSummary      日终总结
    │
    ├── 目标类（全屏覆盖，支持层级跳转）
    │   ├── "goals"             GoalList            目标列表
    │   │   ├── → "goal-detail"                      点击目标 → 目标详情
    │   │   └── → "project-detail"                   点击项目 → 项目详情
    │   ├── "goal-detail"       GoalDetailOverlay   目标详情
    │   └── "project-detail"    ProjectDetailOverlay 项目详情
    │       └── → "goal-detail"                      点击子目标 → 目标详情
    │
    ├── 待办类
    │   ├── "todos"             TodoPanel           待办面板（底部弹出）
    │   └── "today-todo"        TodayGantt          今日甘特图
    │
    └── "notifications"         NotificationCenter  通知中心
        └── 点击通知 → 跳转对应 overlay 或切换 tab
```

### PC 端：文件路由 + MenuBar

PC 端使用 Next.js App Router 文件路由，顶部 MenuBar 悬浮导航。

```
PCLayout (所有 PC 页面的公共外壳)
├── MenuBar (fixed top, hover 显示)
│   ├── 左侧: Logo + 场景切换按钮
│   │   ├── /write     "写作"    默认场景，纯输入
│   │   ├── /timeline  "时间线"  三列布局浏览
│   │   ├── /map       "地图"    认知网络可视化
│   │   └── /goals     "目标"    目标/项目管理
│   └── 右侧: 功能按钮
│       ├── 🔍 搜索
│       ├── 🎙 语音输入
│       ├── ⚡ 行动（右侧边栏 320px）
│       ├── 📋 回顾（中心弹窗）
│       └── ⚙️ 设置
└── children (当前场景页面内容)
```

### 导航入口汇总

| 入口 | 触发方式 | 目标 |
|------|----------|------|
| 头像 | 点击 | SidebarDrawer |
| Segment | 仅点击（spec 1.2 禁用手势滑动，避免与 NowCard/待办行水平手势冲突） | diary ↔ todo tab 切换 |
| 搜索图标 | 点击 | search overlay |
| 通知铃铛 | 点击 | notifications overlay |
| FAB | 点击/长按 | 录音 / 命令对话 |
| 侧边栏菜单 | 点击各项 | 对应 overlay |
| 通知项 | 点击 | morning-briefing / evening-summary / todo tab / 认知地图 |
| 目标列表项 | 点击 | goal-detail / project-detail overlay |
| 自动触发 | 7-10am 首次打开 | morning-briefing overlay |
| 返回键/右滑 | 手势/系统键 | 关闭当前 overlay |

### 转场动画

| 场景 | 动画 | 参数 |
|------|------|------|
| Overlay 进入 | SwipeBack 包裹，fixed 全屏覆盖 | z-50, bg-background |
| Overlay 返回 | 左边缘右滑（30px 激活，100px 触发） | translateX → 100%, 200ms ease-out |
| Tab 切换 | 仅点击（spec 1.2 明确禁用手势） | Segment 点击切换 diary ↔ todo |
| 侧边栏 | 左侧滑入 | 75vw / max 320px |
| TodoPanel | 底部弹出 | sheet 模式 |
| PC MenuBar | hover 显示/隐藏 | 鼠标 Y≤48px 触发，离开 400ms 后隐藏，fade 300ms |
| NowCard 滑动 | 右滑完成(森林色) / 左滑跳过(晨光色) | 40px 激活，80px 触发，300ms ease-out |
| 认知地图 | LifeMap isOpen 控制 | 独立状态，非 overlay |

### 设计稿 × 代码实现状态（2026-03-28 审计，代码验证）

| 设计稿 | 功能 | 视觉 | 说明 |
|--------|------|------|------|
| 01 Journal View | ✅ | ❌ | 日记流+日期分组+展开+多选删除有，缺 AI 洞察插入卡片(3.6)、No-Line 样式 |
| 02 Todo View | ✅ | ⚠️ | NowCard+GoalIndicator+Today/Tomorrow/Later分组+进度条+PendingIntents 全有，已用 Editorial Serenity 色系 |
| 03-04 NowCard 滑动 | ✅ | ⚠️ | 原生 pointer 事件完整状态机(idle/swiping/forking/dropping)，森林色/晨光色露出+40px激活阈值+flyOut+API上报 全有。注意：当前实现是 forking/dropping 分叉式，spec 4.9 改为单步滑动+Action Sheet（需对齐）。缺 spring 物理+粒子（锦上添花） |
| 05 Sidebar | ✅ | ⚠️ | 头像+用户名+目标列表(展开/折叠)+三组分区+退出登录 全有，已用 Editorial Serenity 色系。缺 spec 6.2 的「方向区」Cluster 分类（依赖 /topics API） |
| 06 FAB 文字态 | ✅ | ⚠️ | TextBottomSheet: 命令建议+附件(拍照/相册/文件)+URL检测导入+Mic/Send切换 全有 |
| 07 FAB 语音态 | ✅ | ⚠️ | 双模式：手持录音(全屏沉浸+方向标签：取消/常驻/指令) + 锁定录音(RecordingImmersive: 大波形+计时器+转写+暂停) |
| 08 FAB 处理态 | ✅ | ✅ | deer 渐变胶囊 + Sparkles 旋转 + 趣味文案 + 30s 安全超时 |
| 09 Journal 展开 | ✅ | ⚠️ | 就地展开+音频播放器+Strike列表+待办+关联记录+source_type切换 有 |
| 10 Todo Detail | ⚠️ | ❌ | 日期/时间/AI plan/目标关联 有，缺 sub-task 树(需 todo.parent_id)、comment/语音备注 |
| 11 Goal Detail | ✅ | ⚠️ | 四维健康条+进度百分比+待办列表+认知叙事时间线+「和路路讨论」全有。缺雷达图可视化（当前为四条水平条） |
| 12 Project Detail | ✅ | ⚠️ | Stitch 风格排版+子目标分组+待办+总进度统计 有。缺 momentum/attention 指标 |
| 13 Discovery | ❌ | ❌ | 侧边栏入口有但 onClick 为 TODO 注释，无内容页（依赖 topic-lifecycle /topics API） |
| 14 Daily Review | ⚠️ | ❌ | `daily-review.tsx` 是硬编码 mock 旧壳；真正内容在 `morning-briefing.tsx`(229行) 和 `evening-summary.tsx`(215行)，已接真实 API。设计要求卡片横滑式（当前为纵向滚动列表） |
| 15 Cognitive Stats | ⚠️ | ❌ | recharts Bar/Line/标签分布图 有，缺极性环形图、认知地图可视化 |
| 16 Chat Advisor | ✅ | ⚠️ | 流式+气泡+三模式(review/command/insight)+命令芯片+Glass header 全有 |
| 17-18 Onboarding | ⚠️ | ⚠️ | 5步对话式引导+AI气泡+跳过 有，缺独立欢迎页(spec 10.1 页面1)+语音输入选项 |
| 19-20 Login/Register | ✅ | ⚠️ | LuluLogo+品牌色+surface背景+deer渐变按钮+rounded-xl输入框 有。缺像素小鹿替换 LuluLogo |
| 21 Notifications | ✅ | ⚠️ | 分类图标(dawn/deer/sky/forest/maple)+时间格式+未读标点+全部已读+Glass header 全有，已用 Editorial Serenity 色系。缺后端持久化（仅内存存储） |

总结: **功能完成度 ~85%**，**视觉完成度 ~25%**（部分组件已用 Editorial Serenity 色系，但字体/No-Line/间距未对齐）。

视觉已部分到位的组件（使用了 surface/deer/forest/dawn/muted-accessible 等色系）：
  WorkspaceHeader、NowCard、TodoWorkspaceView、GoalDetailOverlay、ProjectDetailOverlay、
  ChatView、NotificationCenter、LoginPage、SidebarDrawer、OnboardingSeed

视觉完全未到位的组件（仍用 bg-background/border-border/shadow-md 等旧色系）：
  NotesTimeline(部分)、StatsDashboard、DailyReview、MorningBriefing、EveningSummary

详见 `specs/design-visual-alignment.md`（视觉对齐 spec）和 `specs/app-mobile-redesign.md`（实现进度审计章节）。

### 已知问题与待改进

**前端架构：**
1. **overlay 无堆栈**：当前 `activeOverlay` 是单一状态，goals → goal-detail 通过替换实现，无法"返回上一层"。建议升级为 overlay 栈（数组）支持 push/pop
2. **认知地图独立于 overlay 系统**：cognitiveMapOpen 是单独状态，与 activeOverlay 并行但无统一管理
3. **无转场动画统一层**：各 overlay 各自处理动画，无统一的 AnimatePresence / transition 管理（见 design-visual-alignment 场景 7.1）
4. **Glass & Soul 部分已实现**：WorkspaceHeader/ChatView/NotificationCenter 已有 `bg-surface/80 backdrop-blur-[12px]`，但 MorningBriefing/EveningSummary/StatsDashboard/NotesTimeline 的 header 仍用 `border-b border-border/60` 旧样式

**Spec 与代码不一致：**
5. **NowCard 左滑交互不一致**：spec 4.9 改为「单步滑动+弹出 Action Sheet 选原因」，但代码仍是 forking/dropping 分叉式（滑到 30-40% 进入 fork zone，下拉选原因）。两种方案都能工作，需决定统一哪种
6. **字体 spec 不一致**：`app-mobile-redesign.md` 写 Noto Serif SC + Inter，`design-visual-alignment.md` 和 Pencil 设计稿写 Newsreader + Inter。需统一（建议：Newsreader 标题 + Noto Serif SC 中文回退 + Inter 正文）
7. **侧边栏标题不一致**：spec 6.2 要求「我的方向」（Cluster 分类），代码用「我的目标」（Goal 列表）。前者依赖 /topics API

**后端缺口：**
8. **发现页无后端**：侧边栏入口存在但 overlay 无实现，需 `GET /api/v1/topics` + `GET /api/v1/topics/:id/lifecycle`（定义在 topic-lifecycle spec）
9. **AI Window 无后端**：需 `GET /api/v1/companion/status`（定义在 ai-companion-window spec）
10. **通知无持久化**：仅 WS 推送 + 内存存储，刷新即丢失。需新建 notification 表 + CRUD API
11. **Todo sub-task 无支持**：spec 4.4 要求子任务树，需 todo.parent_id 字段（migration 待建）
12. **项目 momentum/attention 无 API**：spec 7.2 要求，当前 project detail 只有完成百分比

**PC 端（低优先级）：**
13. **PC 端功能按钮未接线**：MenuBar 右侧按钮的 onAction 只有 console.log
14. **PC 端无 overlay 系统**：搜索、对话、设置等在 PC 端尚未实现

