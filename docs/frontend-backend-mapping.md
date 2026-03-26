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
