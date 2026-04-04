# V2Note Roadmap

> 最后更新：2026-04-04
> 数据来源：`specs/INDEX.md` + 代码实际状态核验

## ✅ 已完成 — 代码已落地

### 认知引擎（全部完成）
- [x] **涌现全生命周期** — 5阶段完整：吸收/释放/清理/创建/合并 (`emergence-lifecycle.md`)
- [x] **知识生命周期** — 新旧覆盖检测+撤销+告警 (`knowledge-lifecycle.md`)
- [x] **Strike 提取** — 5极性分类+复杂文本拆分+素材降权 (`strike-extraction.md`)
- [x] **人物画像** — 高频检测+行为模式+参谋注入 (`person-profile.md`)
- [x] **Record 层级标签** — JSONB存储+batch刷新+L2>L1>L3优先级 (`record-hierarchy-tags.md`)

### 目标体系（全部完成）
- [x] **目标全生命周期** — 列表/详情/创建/归档/健康4D (`goal-lifecycle.md`)
- [x] **目标自动关联** — 全量扫描+增量+健康计算+项目汇总 (`goal-auto-link.md`)
- [x] **目标粒度** — 快路径(action/goal/project)+慢路径(intend密度涌现) (`goal-granularity.md`)
- [x] **顶层维度** — 种子维度+关键词匹配+统一模型 (`top-level-dimensions.md`)

### Auth（全部完成）
- [x] **Token & Session** — 2h access/30d refresh/并发锁/主动续期 (`auth-core.md`)
- [x] **UX & Registration** — 记住手机号/自动登录/密码可见/失败计数 (`auth-ux.md`)

### 其他已完成
- [x] **Cold Start & Onboarding** — AI五问+欢迎种子+早期Bond检测 (`cold-start.md`)
- [x] **Daily Report Core** — 晨报/晚报/视角轮换/认知注入 (`daily-report-core.md`)

---

## 🟡 Active — 已部分实现，仍需推进

### Todo System (~85%)
- [x] 核心数据流：TodoDTO完整字段、goal_title JOIN、subtask计数
- [x] AI提取：粒度判断、时间/人物/优先级提取、voice-action分类
- [x] 去重：dedupCreate() embedding匹配 (阈值0.65)
- [x] 时间解析：buildDateAnchor()、时间槽分配、时区修复(Z后缀)
- [x] Strike关联：intend投射、strike_id回填
- [x] UI双视图：TimeView+ProjectView、日历条、滑动手势、优先级选择器
- [ ] **子任务前端展示** — 后端就绪(parent_id/counts)，前端折叠/展开UI待做
- [ ] **项目视图瀑布流** — ProjectView待重写
- [ ] **voice-action统一tool路径** — 未完全复用Chat tool handler

### Chat System (~70%)
- [x] UI重构：消息气泡、毛玻璃输入栏、AI状态呼吸点
- [x] 问候个性化：加载最近记录+待办生成上下文问候
- [x] AI处理状态：引用计数+衰减定时器+绝对超时
- [ ] **WebSocket事件流验证** — todo.created → endAiPipeline 集成待验证

### Daily Report Extended (~40%)
- [x] 认知洞察注入（Phase 1）
- [ ] **周报/月报** — 未开始
- [ ] **历史报告页** — 未开始
- [ ] **通知Hook** — 未开始

### Voice Routing (~60%)
- [x] 三层路由骨架：sourceContext/forceCommand/AI分类
- [x] Layer 1(todo模式)+Layer 2(命令模式) 已实现
- [ ] **Layer 3 regex预过滤移除** — ACTION_PATTERNS仍在使用，应改为全部AI分类
- [ ] **用户设置联动** — confirm_before_execute 定义了但UI集成待完善

### Voice Todo Extension (~50%)
- [x] TodoCommand接口定义(create/complete/modify/query)
- [x] AI提取prompt(todo-extract-prompt.ts)
- [ ] **确认弹窗UI** — command-sheet.tsx 不存在
- [ ] **提醒系统** — DB schema(reminder_*)未迁移，调度未实现
- [ ] **周期任务** — DB schema(recurrence_*)未迁移

### 主题生命周期 (~85%)
- [x] 侧边栏列表、全局过滤、生命周期视图(4阶段)
- [x] 脉络Tab、种子晋升、沉默区唤醒、Tier2孵化
- [ ] **Harvest AI摘要生成** — 结构就绪，生成逻辑待完成

### Mobile App (~65%)
- [x] 整体结构、日记/待办视图、FAB录音、侧边栏基本结构
- [x] Chat页面完整实现、Onboarding AI对话、登录/登出
- [ ] **设计语言落地** — 触控44px规则未执行、无press反馈、emoji未替换SVG
- [ ] **Discovery页** — 空白（缺/topics API）
- [ ] **/timeline Runtime Error** — "Objects are not valid as React child"
- [ ] **通知持久化** — 仅内存，无持久层
- [ ] **AI伴侣窗口** — 仅占位符，状态机未实现
- [ ] **PC端导航** — 页面间零导航

### UI/UX 审查 (审查100%, 修复0%)
- [x] 审查已完成并文档化(7类问题)
- [ ] **触控目标** — 7个元素<44px (🔴 CRITICAL)
- [ ] **无障碍** — ARIA/对比度/reduced-motion 全缺
- [ ] **按压反馈** — 所有按钮/卡片无active状态
- [ ] **PC端导航** — 侧边栏缺失 (🔴 CRITICAL)
- [ ] **空状态** — 5个页面无引导
- [ ] **字体加载** — @import阻塞渲染

---

## 🔵 Active — 尚未开始实施

### 基础设施
- [ ] **附件持久化 + RAG** — Phase 2-3 (`attachment-persistence.md`)
- [ ] **并发扩容** — 阿里云方案 (`concurrency-scaling.md`)

### UI
- [ ] **移动端行动面板** (`mobile-action-panel.md`)
- [ ] **留存分析** (`onboarding-retention-analytics.md`)

---

## 🟡 Draft — 规划中

- [ ] 发现页 (`discovery-page.md`)
- [ ] 外部数据源集成 (`external-integration.md`)
- [ ] 鸿蒙适配 (`harmony-support.md`)
- [ ] 阅读器 (`reader.md`)

---

## 📋 已知问题（非 spec，跟踪用）

- Android 状态栏侵入（Magic 7）— 短期 XML opt-out 已执行，长期需 safe-area 插件
- Chat 语音录入 Android WebView 不可用 — 需迁移到 capacitor-voice-recorder
- /goals 标题显示 AI reasoning 文本（数据泄漏）
- 13个overlay组件在页面加载时全量导入（应改为dynamic import）

---

## 🎯 建议优先级（下一步）

1. **UI/UX 修复** — 触控44px + press反馈（用户体感直接提升，工作量小）
2. **子任务前端** — 后端已完备，前端折叠展开即可落地
3. **/timeline 崩溃修复** — 阻断功能
4. **Voice 确认弹窗** — 打通语音→待办最后一公里
5. **周报/月报** — Daily Report 自然延伸
