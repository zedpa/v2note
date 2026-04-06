---
id: "050b"
title: "Todo System — UI & Interactions"
status: active
domain: todo
dependencies: ["todo-core.md"]
superseded_by: null
related: ["todo-core.md"]
created: 2026-03-23
updated: 2026-04-04
---

# Todo System — UI & Interactions (界面与交互层)

## 概述

本文件描述待办系统的界面与交互层。数据模型、AI 提取逻辑、去重、时间解析、子任务、Strike 关联等核心逻辑请参见 [todo-core.md](todo-core.md)。

---

## 1. UI & Interactions (界面与交互)

> 来源: todo-ui-redesign.md (✅ 实现完成), todo-interaction-refactor.md (🟡 待开发)

### 1.1 双视图体系 <!-- ✅ completed -->

- **时间视图 (TimeView)**: 以"今天"为锚点，日期轴横向滑动，任务按时段分组（随时/上午/下午/晚上）
- **项目视图 (ProjectView)**: 以目标/项目为容器，每个项目是一张卡片，内含子任务列表

两个视图通过顶部 Segment 的"待办"下拉菜单切换，共享底层数据和操作。

### 1.2 信息架构

```
app/page.tsx
  └── TopNav: [日记 | 待办▼] 分段器
      └── 待办激活时: 点击"待办▼"弹出视图选择菜单
          ├── 日期视图 (默认)
          └── 项目视图
  └── 待办 Tab 激活时:
      ├── TimeView (日期视图，默认)
      │   ├── TimeViewHeader: 星期X + 月份年份 + 日历按钮
      │   ├── CalendarStrip: 无限滚动日期条
      │   ├── TimeBlock × 4: 随时/上午/下午/晚上
      │   └── (底部留白)
      └── ProjectView (项目视图) — 瀑布流
          ├── ProjectCard × N
          ├── InboxCard: "其他"虚拟项目
          └── (底部留白)
```

### 1.3 时段分配规则

```typescript
const TIME_SLOTS: TimeSlotConfig[] = [
  { key: 'anytime',   label: '随时', hourRange: [-1, -1] },
  { key: 'morning',   label: '上午', hourRange: [5, 12]  },
  { key: 'afternoon', label: '下午', hourRange: [12, 18] },
  { key: 'evening',   label: '晚上', hourRange: [18, 29] },  // 跨日到次日 4:59
]
```

### 1.4 设计 Token

```css
:root {
  --bg-base: #161311;
  --bg-card: #221D1A;
  --brand-bark: #3D3228;
  --brand-deer: #C8845C;
  --brand-record: #C45C5C;
  --text-primary: #FAF6F0;
  --text-secondary: #9B8E82;
  --border-color: rgba(155, 142, 130, 0.2);
  --tag-anytime: rgba(155, 142, 130, 0.15);
  --tag-morning: rgba(200, 132, 92, 0.2);
  --tag-afternoon: rgba(123, 163, 196, 0.15);
  --tag-evening: rgba(92, 122, 94, 0.15);
}
```

### 场景 1.1: 时间视图 — 默认加载 <!-- ✅ completed -->
```
Given 用户在待办 Tab
When  页面加载完成
Then  显示时间视图（默认）
  And 显示今天的星期和日期
  And CalendarStrip 高亮今天，显示本周 7 天
  And 4 个时段块按序显示（随时/上午/下午/晚上）
  And 每个时段块内显示对应时段的未完成任务
  And 无任务的时段块显示空状态占位卡
```

### 场景 1.2: 时间视图 — 日期切换（无限滚动） <!-- ✅ completed -->
```
Given 时间视图已加载
When  用户点击 CalendarStrip 上的某一天
Then  该日期高亮
  And TimeViewHeader 更新为对应星期和月份
  And 4 个时段块刷新为该日期的任务
```

### 场景 1.3: 时间视图 — 时段折叠 <!-- ✅ completed -->
```
Given 某时段块有 3 个任务
When  用户点击该时段的 BlockHeader
Then  任务列表收起（AnimatePresence 淡出 + 高度收缩）
  And 计数仍然显示
```

### 场景 1.4: 时间视图 — 快速添加任务 <!-- ✅ completed -->
```
Given 上午时段块显示空状态
When  用户点击空状态卡片的 + 按钮
Then  打开 TodoCreateSheet，日期预填为当前 selectedDate，时段预设
When  用户输入"准备会议 PPT"并提交
Then  Sheet 关闭，上午时段块立即显示新任务（乐观更新）
```

### 场景 1.5: 项目视图 — 加载 <!-- ✅ completed -->
```
Given 用户点击右上角视图切换按钮
When  切换到项目视图
Then  显示第一个活跃项目的 ProjectCard
  And 底部显示 PageDots 分页指示器
  And 卡片内列出该项目的子任务
```

### 场景 1.6: 项目视图 — 完成任务 <!-- ✅ completed -->
```
Given 项目"供应链优化"下有任务"回复客户邮件"
When  用户点击该任务的 checkbox
Then  checkbox 变为勾选状态，文字添加删除线，项目计数 -1（乐观更新）
```

### 场景 1.7: 视图切换 — Segment 下拉菜单 <!-- ✅ completed -->
```
Given 用户在待办 Tab（当前为日期视图）
When  点击顶部 Segment 的"待办▼"按钮
Then  弹出下拉菜单，显示"日期视图"和"项目视图"两个选项
  And 当前选中的视图高亮（primary 色）
When  选择"项目视图"
Then  菜单关闭，切换到项目视图
  And viewMode 状态由 page.tsx 管理，通过 props 传递给 TodoWorkspace
注意: 日记 Tab 时点击"待办"直接切换 Tab，不弹菜单
```

### 场景 1.8: 任务详情编辑 <!-- ✅ completed -->
```
Given 时间视图中某任务卡片
When  用户点击任务行（非 checkbox 区域）
Then  底部弹出 TodoEditSheet
  And 显示标题（可编辑）、日期/时间/时长、领域+影响度、关联目标、子任务列表
```

### 场景 1.9: 实时同步 <!-- ✅ completed -->
```
Given 用户正在看待办时间视图
When  后端通过 AI digest 创建了一个新待办，WebSocket 推送 todo.created 事件
Then  新待办自动出现在对应时段块中，有轻量入场动画
```

### 场景 1.10: 空状态引导 <!-- ✅ completed -->
```
Given 用户无任何待办
When  打开待办 Tab
Then  时间视图 4 个时段块全部显示空状态卡片，每个有对应引导文案和 + 入口
```

### 1.5 交互增强 — TaskItem 滑动手势 (P0, 🟡 待开发)

```
正常状态：
┌─────────────────────────────┐
│ ○ ●  明天找张总确认报价       │
└─────────────────────────────┘

← 左滑：露出"推迟"(蓝) + "删除"(红)
→ 右滑：快速完成 (绿色 ✓)
```

#### 场景 1.11: 左滑露出操作按钮
```
假设 (Given)  用户看到一条未完成的待办
当   (When)   手指从右往左滑动超过 60px
那么 (Then)   待办卡片向左平移，露出右侧"推迟"和"删除"按钮
并且 (And)    松手后卡片保持在滑开状态
```

#### 场景 1.12: 左滑 — 推迟操作
```
假设 (Given)  待办已左滑露出操作区
当   (When)   用户点击"推迟"按钮
那么 (Then)   待办的 scheduled_start 推迟到明天同一时间
并且 (And)    卡片自动回弹，如果当前在今日视图则该待办消失
```

#### 场景 1.13: 右滑快速完成 + 撤销 Toast
```
假设 (Given)  用户看到一条未完成的待办
当   (When)   手指从左往右滑动超过 80px
那么 (Then)   露出左侧绿色完成区域（✓ 图标）
并且 (And)    松手后自动标记完成，底部弹出撤销 Toast
并且 (And)    3 秒内点撤销可恢复，超时后 Toast 消失
并且 (And)    Capacitor 环境下触发成功震动
```

#### 场景 1.14: 同一时刻只能有一个卡片处于滑开状态
```
假设 (Given)  待办 A 已左滑处于打开状态
当   (When)   用户开始滑动待办 B
那么 (Then)   待办 A 自动回弹关闭
```

#### 场景 1.15: 已完成待办不支持右滑
```
假设 (Given)  待办已标记为完成（done=true）
当   (When)   用户右滑该待办
那么 (Then)   不触发完成操作，左滑仍可用（可删除）
```

技术方案：纯 CSS transform + touch event（不引入第三方手势库），阈值常量：
```typescript
const LEFT_THRESHOLD = 60;    // 左滑吸附阈值
const RIGHT_THRESHOLD = 80;   // 右滑完成阈值
const ACTION_WIDTH = 120;     // 左滑操作区总宽度
```

### 1.6 项目视图 — 瀑布流网格 (P1, 🟡 待开发)

```
┌──────────────┐  ┌────────────────┐
│ 📦 收集箱 3/4 │  │ 🎬 自媒体  4/6  │
│ ○ 整理衣服  ★│  │ ○ 剪辑视频   ★│
│ ○ 洗衣服    │  │ ○ 发图文笔记  ★│
│ + 添加待办   │  │ + 添加待办     │
└──────────────┘  └────────────────┘
```

#### 场景 1.16: 瀑布流双列布局
```
假设 (Given)  用户切换到项目视图
当   (When)   有多个活跃项目
那么 (Then)   项目卡片以双列瀑布流排列，每张卡片高度自适应
并且 (And)    左右列交替放置，短列优先
并且 (And)    "其他"（无项目归属的散装任务）作为最后一张卡片
```

#### 场景 1.17: 卡片颜色区分
```
假设 (Given)  项目视图显示多个项目卡片
当   (When)   渲染卡片
那么 (Then)   每张卡片有独立的主题色（从预定义调色板轮流分配）
并且 (And)    暗色模式下自动调整为低饱和度版本
```

调色板:
```typescript
const PROJECT_COLORS = [
  { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-rose-100 dark:bg-rose-900/30",     text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/30",text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-sky-100 dark:bg-sky-900/30",        text: "text-sky-700 dark:text-sky-300" },
  // ...
];
```

#### 场景 1.18: 点击卡片展开全屏
```
假设 (Given)  用户点击项目卡片头部
当   (When)   卡片展开
那么 (Then)   全屏展示该项目的所有待办
并且 (And)    全屏视图支持左右滑动切换项目
并且 (And)    可以返回瀑布流
```

### 场景 1.18b: 项目详情页创建待办 <!-- ✅ completed (bug fix) -->
```
Given 用户在项目视图，点击项目卡片头部进入项目详情 Sheet
When  点击详情页中的"添加任务"按钮
Then  先关闭项目详情 Sheet，再打开 TodoCreateSheet
  And TodoCreateSheet 的 parent_id 预设为当前项目 ID
  And 创建参数类型与 store.create 完全匹配（text/scheduled_start/estimated_minutes/priority/parent_id）
Bug 修复: 此前 ProjectDetailSheet(shadcn Sheet, z-50) 与 TodoCreateSheet(fixed z-50) 同时打开时，
  TodoCreateSheet 的 backdrop(z-40) 被 ProjectDetailSheet overlay 遮挡导致无法交互。
  修复方案: handleAdd 先调 setDetailGroup(null) 关闭详情页再打开创建面板。
```

### 1.7 优先级编辑器 (P2, 🟡 待开发)

```
优先级选择器（内联横排）：
  ○ 低   ● 中   ○ 高   ○ 紧急
  灰     默认    橙     红
```

| UI 标签 | priority 值 | 色点 |
|---------|------------|------|
| 低 | 1 | 不显示 |
| 中 | 3 | 不显示（默认） |
| 高 | 4 | 橙色 `bg-orange-400` |
| 紧急 | 5 | 红色 `bg-red-500` |

#### 场景 1.19: 创建待办时设置优先级
```
假设 (Given)  用户打开创建待办 Sheet
当   (When)   输入待办文本
那么 (Then)   文本下方显示优先级选择器（低/中/高/紧急），默认选中"中"
并且 (And)    提交时 priority 值一起传给 API
```

#### 场景 1.20: 编辑待办时修改优先级
```
假设 (Given)  用户点击待办打开编辑 Sheet
当   (When)   Sheet 加载
那么 (Then)   显示优先级选择器，回显当前优先级
并且 (And)    修改优先级后实时保存
```

#### 场景 1.21: 创建表单增加时长和项目选择
```
假设 (Given)  用户打开创建待办 Sheet
当   (When)   输入待办文本后
那么 (Then)   显示快捷标签行：📅 日期  ⏰ 时段  ⏱ 时长  📂 项目
并且 (And)    时长可选 15分/30分/1小时/2小时
并且 (And)    项目可选已有项目列表
```

#### 场景 1.22: 待办条目显示目标标签 + 优先级色点
```
假设 (Given)  待办"找张总确认报价"属于目标"供应链优化"，priority=5
当   (When)   在时间视图中渲染该待办
那么 (Then)   文本左侧显示红色优先级色点（priority >= 4）
并且 (And)    文本下方 Meta 行显示目标标签 pill
并且 (And)    无父目标/低优先级时不显示对应元素（避免噪音）
```

### 1.8 月历展开 / 周月切换 (P3, 🟡 待开发)

```
收起状态（默认）：
┌─── 星期四 ──────── 4月 2026 📅 ─┐
│ 一  二  三  [四]  五  六  日    │
└─────────────────────────────────┘
          ↕ 点击 📅 或下拉手势
展开状态（月历）：
┌─── 4月 2026 ──── < > ──── ✕ ──┐
│ 完整月历，有待办的日期有小圆点  │
└─────────────────────────────────┘
```

#### 场景 1.23: 点击日历图标展开月历
```
假设 (Given)  用户在时间视图看到周历条
当   (When)   点击右上角的日历图标
那么 (Then)   周历条动画展开为完整月历
并且 (And)    当前选中日期高亮，今天有特殊标记
并且 (And)    有待办的日期下方显示小圆点
```

#### 场景 1.24: 月历中选择日期
```
假设 (Given)  月历已展开
当   (When)   用户点击某个日期
那么 (Then)   选中日期更新，月历自动收起回周历条
并且 (And)    时间视图刷新显示该日的待办
```

#### 场景 1.25: 周历条左右滑动切换周
```
假设 (Given)  用户在周历条（收起状态）
当   (When)   手指从右往左滑动
那么 (Then)   周历条切换到下一周，选中日期变为下周同一星期几
```

#### 场景 1.26: 日期状态圆点 — 三色系统
```
判定顺序（高→低）：
1. 该日所有待办已完成 → 无点
2. 该日有过期未完成待办（date < today && !done）→ 🟡 黄点
3. 该日有未完成待办 + 用户未查看过 → 🔴 红点
4. 该日有未完成待办 + 用户已查看过 → 🟢 绿点
5. 该日无待办 → 无点
```

技术方案:
- CalendarExpand 组件：展开渲染 shadcn/ui Calendar，收起渲染 CalendarStrip
- viewedDates: `Set<string>` 持久化到 localStorage（key 含 userId）
- computeDateDots(allTodos, viewedDates, today) → `Map<string, "red" | "green" | "yellow">`

### 1.9 组件清单

| 组件 | 文件 | 状态 |
|------|------|------|
| TodoSegment | `features/todos/components/todo-segment.tsx` | ✅ |
| TimeView | `features/todos/components/time-view.tsx` | ✅ |
| TimeViewHeader | `features/todos/components/time-view-header.tsx` | ✅ |
| CalendarStrip | `features/todos/components/calendar-strip.tsx` | ✅ |
| TimeBlock | `features/todos/components/time-block.tsx` | ✅ |
| ProjectView | `features/todos/components/project-view.tsx` | ✅ (待瀑布流重写) |
| ProjectCard | `features/todos/components/project-card.tsx` | ✅ (待瀑布流重写) |
| TaskItem | `features/todos/components/task-item.tsx` | ✅ |
| TodoCreateSheet | `features/todos/components/todo-create-sheet.tsx` | ✅ |
| TodoEditSheet | `features/todos/components/todo-edit-sheet.tsx` | ✅ |
| SwipeableTaskItem | `features/todos/components/swipeable-task-item.tsx` | 🟡 待建 |
| PrioritySelector | `features/todos/components/priority-selector.tsx` | 🟡 待建 |
| CalendarExpand | `features/todos/components/calendar-expand.tsx` | 🟡 待建 |

### 1.10 待废弃组件

| 文件 | 替代 |
|------|------|
| `features/todos/components/todo-panel.tsx` | TimeView + ProjectView |
| `features/todos/components/todo-diary-card.tsx` | TimeView |
| `features/todos/components/today-gantt.tsx` | TimeView |
| `features/todos/components/todo-view.tsx` | TaskItem |
| `features/todos/hooks/use-todos.ts` | useTodoStore |
| `features/todos/hooks/use-today-todos.ts` | useTodoStore |

### UI 边界条件
- [ ] P0 滑动与纵向滚动冲突：水平位移 > 垂直位移时才进入滑动模式
- [ ] P0 同一时刻只能有一个卡片处于滑开状态
- [ ] P1 瀑布流 0 个项目 → 空状态
- [ ] P1 瀑布流 1 个项目 → 单列居中
- [ ] P2 priority=null 与 priority=3 视为等价（默认中优先级）
- [ ] P2 项目列表来源统一：创建表单和项目视图使用同一份 projects 数据
- [ ] P3 viewedDates 持久化 localStorage，key 含 userId，超过 60 天自动清理
- [ ] P3 月历在小屏上的宽度适配

---

## Implementation Phases (实施阶段)

### Phase 1: Core Data (核心数据层) — ✅ completed
- [x] TodoDTO 类型定义
- [x] API 客户端重写（类型安全）
- [x] useTodoStore 统一 hook
- [x] 后端 date 参数支持 + goal_title JOIN
- [x] todo.strike_id + goal.cluster_id 数据库变更
- [x] todo 去重（dedupCreate）

### Phase 2: AI Extraction (AI 提取链路) — ✅ completed
- [x] digest 提示词重写（提取器角色 + nucleus 质量约束）
- [x] voice-action 提示词重写 + cleanActionPrefix
- [x] JSON 解析防御（safeParseJson 替代裸 JSON.parse）
- [x] chat 对话存档只保留用户消息
- [x] intend Strike → todo 自动投影
- [x] Strike 删除保护

### Phase 3: Subtasks (子任务) — ✅ completed (backend)
- [x] parent_id 字段 + CASCADE 删除
- [x] subtask_count / subtask_done_count 计算
- [x] AI 自动拆分（action_plan → 子 todo）
- [x] 子任务全部完成 → 父任务自动完成
- [ ] 前端子任务展示（待设计稿对齐）

### Phase 4: UI Redesign (UI 重构) — ✅ completed
- [x] 双视图体系（TimeView + ProjectView）
- [x] CalendarStrip 无限滚动
- [x] TimeBlock 时段分组（随时/上午/下午/晚上）
- [x] TodoCreateSheet / TodoEditSheet
- [x] 视图切换动画
- [x] 实时同步（WebSocket）
- [x] E2E 测试

### Phase 5: Time Parsing (时间解析) — 🟡 待开发
- [ ] buildDateAnchor() 共享时间锚点
- [ ] 三条路径统一注入时间锚点
- [ ] voice-action 创建统一走 tool handler

### Phase 6: Interaction Enhancement (交互增强) — 🟡 待开发
- [ ] P0: TaskItem 左右滑动手势 + 撤销 Toast + 触觉反馈
- [ ] P1: 项目视图瀑布流网格重做
- [ ] P2: 优先级编辑器 + 创建表单增强
- [ ] P3: 月历展开 + 三色圆点 + 周历滑动切换
- [ ] P4 (远期): 拖拽排序
