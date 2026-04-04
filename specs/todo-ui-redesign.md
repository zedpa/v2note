---
status: superseded
superseded_by: "todo-system.md"
---

# Todo UI 全面重构

> Status: ✅ 实现完成 — 数据层+UI组件+集成+E2E 全部就位
> Created: 2026-03-31
> Dependencies: Phase 4 todo-strike-bridge ✅, Phase 7.5 todo-subtask ✅, Phase 8 cognitive-structure-repair ✅

## 1. 设计目标

将当前停摆的待办功能重构为**双视图体系**：

- **时间视图 (TimeView)**: 以"今天"为锚点，日期轴横向滑动，任务按时段分组（随时/上午/下午/晚上），快速管理每日行动
- **项目视图 (ProjectView)**: 以目标/项目为容器，每个项目是一张卡片，内含其子任务列表

两个视图通过右上角按钮无缝切换，共享底层数据和操作。

## 2. 信息架构

```
app/page.tsx
  └── TopNav: [日记 | 待办] 分段器 + 视图切换按钮
  └── 待办 Tab 激活时:
      ├── TimeView (默认)
      │   ├── TimeViewHeader: 星期X + 月份年份 + 日历按钮
      │   ├── CalendarStrip: 无限滚动日期条，选中日高亮，可向前/后无限滑动
      │   ├── TimeBlock × 4:
      │   │   ├── BlockHeader: 图标 + 中文标签(随时/上午/下午/晚上) + 计数 + 折叠
      │   │   ├── TodoCard × N: 实际任务卡片（未完成在前，已完成划线在后）
      │   │   └── EmptySlot: 空状态占位 + 添加按钮
      │   └── (底部留白，避免被 FAB 遮挡)
      │
      └── ProjectView (切换后) — 水平轮播
          ├── ProjectCard × N: (左右滑动切换项目卡片，每次显示一张)
          │   ├── ProjectHeader: 项目名 + emoji + 任务计数 + 更多菜单
          │   ├── TaskItem × N: checkbox + 标题 + 描述 + meta(链接/日期)
          │   └── AddTaskRow: + 添加任务
          ├── InboxCard: "其他"虚拟项目 — 无 parent_id 的散装任务
          └── PageDots: ● ○ ○ ○ 分页指示器（底部居中）
```

## 3. 数据规范

### 3.1 前端类型定义

```typescript
// ===== 核心类型 =====

/** 待办项（API 返回的完整字段，不再手动映射） */
export interface TodoDTO {
  id: string
  text: string
  done: boolean
  record_id: string | null
  created_at: string
  updated_at?: string

  // 调度
  scheduled_start: string | null      // ISO datetime
  scheduled_end: string | null
  estimated_minutes: number | null
  priority: number | null

  // 领域 & 影响
  domain: string | null               // '工作'|'学习'|'创业'|'家庭'|'健康'|'生活'|'社交'
  impact: number | null               // 1-10

  // AI
  ai_actionable: boolean
  ai_action_plan: string[] | null

  // 层级
  level: number                       // 0=行动, 1=目标, 2=项目
  parent_id: string | null
  cluster_id: string | null
  status: string                      // active|progressing|blocked|paused|completed|abandoned|suggested|dismissed|archived
  strike_id: string | null
  goal_id: string | null              // deprecated, 兼容旧数据

  // 计算字段（后端 JOIN）
  subtask_count: number
  subtask_done_count: number
  goal_title: string | null           // parent todo 的 text
}

/** 时段枚举 */
export type TimeSlot = 'anytime' | 'morning' | 'afternoon' | 'evening'

/** 时段配置 */
export interface TimeSlotConfig {
  key: TimeSlot
  label: string                       // 中文显示：随时/上午/下午/晚上（UI 唯一标签）
  icon: string                        // lucide icon name
  hourRange: [number, number]         // [startHour, endHour)，如 [6, 12) 为上午
  colorVar: string                    // CSS 变量名
  emptyHint: string                   // 空状态提示文本
}

/** 项目卡片（level >= 1 的 todo 聚合，或"其他"虚拟分组） */
export interface ProjectGroup {
  project: TodoDTO | null             // null = "其他"虚拟分组（散装任务）
  tasks: TodoDTO[]                    // children (parent_id = project.id) 或无归属任务
  pendingCount: number
  doneCount: number
  isInbox: boolean                    // true = "其他"分组
}
```

### 3.2 时段分配规则

```typescript
const TIME_SLOTS: TimeSlotConfig[] = [
  {
    key: 'anytime',
    label: '随时',
    icon: 'Clock',
    hourRange: [-1, -1],              // 特殊：无 scheduled_start 的任务
    colorVar: '--tag-anytime',
    emptyHint: '今天随时可做的事',
  },
  {
    key: 'morning',
    label: '上午',
    icon: 'Sun',
    hourRange: [5, 12],               // 05:00 - 11:59
    colorVar: '--tag-morning',
    emptyHint: '上午要做什么？',
  },
  {
    key: 'afternoon',
    label: '下午',
    icon: 'Sun',
    hourRange: [12, 18],              // 12:00 - 17:59
    colorVar: '--tag-afternoon',
    emptyHint: '下午的安排',
  },
  {
    key: 'evening',
    label: '晚上',
    icon: 'Moon',
    hourRange: [18, 29],              // 18:00 - 04:59(次日)
    colorVar: '--tag-evening',
    emptyHint: '晚上收尾',
  },
]

function assignTimeSlot(todo: TodoDTO): TimeSlot {
  if (!todo.scheduled_start) return 'anytime'
  const hour = new Date(todo.scheduled_start).getHours()
  for (const slot of TIME_SLOTS) {
    if (slot.key === 'anytime') continue
    const [start, end] = slot.hourRange
    // evening 跨日处理：18-29 → 18-23 || 0-4
    if (hour >= start && hour < (end > 24 ? 24 : end)) return slot.key
    if (end > 24 && hour < end - 24) return slot.key
  }
  return 'anytime'
}
```

### 3.3 API 层修复

```typescript
// shared/lib/api/todos.ts — 重写

/** 获取所有待办（带完整类型） */
export async function listTodos(): Promise<TodoDTO[]> {
  const data = await get('/api/v1/todos')
  return data as TodoDTO[]            // 不再手动映射，直接信任后端字段
}

/** 获取指定日期的待办 */
export async function listTodosByDate(date: string): Promise<TodoDTO[]> {
  const data = await get(`/api/v1/todos?date=${date}`)
  return data as TodoDTO[]
}

/** 获取项目列表（level >= 1） */
export async function listProjects(): Promise<TodoDTO[]> {
  const data = await get('/api/v1/goals')
  return data.map((g: any) => ({
    ...g,
    text: g.title ?? g.text,          // goals API 返回 title，统一为 text
  })) as TodoDTO[]
}

/** 创建待办 */
export async function createTodo(params: {
  text: string
  scheduled_start?: string
  estimated_minutes?: number
  domain?: string
  parent_id?: string
  level?: number
}): Promise<{ id: string }> {
  return post('/api/v1/todos', params)
}

/** 更新待办 */
export async function updateTodo(id: string, params: Partial<Pick<TodoDTO,
  'text' | 'done' | 'scheduled_start' | 'scheduled_end' |
  'estimated_minutes' | 'priority' | 'domain' | 'impact' |
  'level' | 'status' | 'parent_id'
>>): Promise<void> {
  await patch(`/api/v1/todos/${id}`, params)
}

/** 删除待办 */
export async function deleteTodo(id: string): Promise<void> {
  await del(`/api/v1/todos/${id}`)
}
```

### 3.4 统一状态管理

```typescript
// features/todos/hooks/use-todo-store.ts

/**
 * 统一待办数据源，替代 useTodos + useTodayTodos
 * 所有视图从这个 store 读数据、写操作
 */
export function useTodoStore() {
  // 核心数据
  const [allTodos, setAllTodos] = useState<TodoDTO[]>([])
  const [projects, setProjects] = useState<TodoDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 派生数据（自动计算，不存储）
  const todayTodos = useMemo(() =>
    filterByDate(allTodos, selectedDate), [allTodos, selectedDate])

  const timeSlotGroups = useMemo(() =>
    groupByTimeSlot(todayTodos), [todayTodos])

  const projectGroups = useMemo(() =>
    buildProjectGroups(allTodos, projects), [allTodos, projects])
    // 包含活跃项目 + "其他"虚拟分组（isInbox=true，散装任务）
    // 排序：活跃项目按 updated_at DESC，"其他"固定末尾

  // 操作
  async function refresh() { ... }    // 刷新所有数据
  async function toggle(id) { ... }   // 乐观切换 done
  async function create(params) { ... }
  async function update(id, params) { ... }
  async function remove(id) { ... }

  return {
    allTodos, projects, loading, error,
    todayTodos, timeSlotGroups, projectGroups,
    refresh, toggle, create, update, remove,
    selectedDate, setSelectedDate,
  }
}
```

## 4. UI 组件规范

### 4.1 设计 Token（暗色模式，来自参考 HTML）

```css
:root {
  /* 基础 */
  --bg-base: #161311;
  --bg-card: #221D1A;
  --brand-bark: #3D3228;
  --brand-deer: #C8845C;
  --brand-record: #C45C5C;
  --text-primary: #FAF6F0;
  --text-secondary: #9B8E82;
  --border-color: rgba(155, 142, 130, 0.2);

  /* 时段标签 */
  --tag-anytime: rgba(155, 142, 130, 0.15);
  --tag-anytime-text: #9B8E82;
  --tag-morning: rgba(200, 132, 92, 0.2);
  --tag-morning-text: #E8C9A8;
  --tag-afternoon: rgba(123, 163, 196, 0.15);
  --tag-afternoon-text: #A8C4E8;
  --tag-evening: rgba(92, 122, 94, 0.15);
  --tag-evening-text: #A8E8B5;
}
```

### 4.2 组件清单

| 组件 | 文件 | 职责 | 复用 |
|------|------|------|------|
| **TodoSegment** | `features/todos/components/todo-segment.tsx` | 时间/项目视图切换按钮 | 待办 Tab 顶层 |
| **TimeView** | `features/todos/components/time-view.tsx` | 时间视图容器 | 待办 Tab |
| **TimeViewHeader** | `features/todos/components/time-view-header.tsx` | 星期 + 月份 + 日历按钮（点击回今天） | TimeView |
| **CalendarStrip** | `features/todos/components/calendar-strip.tsx` | 无限滚动日期条（虚拟化，前后各预加载 2 周） | TimeView |
| **TimeBlock** | `features/todos/components/time-block.tsx` | 单个时段块（中文标签 + 任务列表 + 已完成区 + 空态） | TimeView × 4 |
| **ProjectView** | `features/todos/components/project-view.tsx` | 项目视图容器（水平轮播 + PageDots） | 待办 Tab |
| **ProjectCard** | `features/todos/components/project-card.tsx` | 单个项目卡片（header + 任务 + 添加行） | ProjectView 轮播页 |
| **InboxCard** | `features/todos/components/inbox-card.tsx` | "其他"虚拟分组卡片（散装任务） | ProjectView 最后一页 |
| **PageDots** | `features/todos/components/page-dots.tsx` | 分页指示器（实心/空心圆点） | ProjectView 底部 |
| **TaskItem** | `features/todos/components/task-item.tsx` | 通用任务行（checkbox + 内容 + meta） | 两个视图共用 |
| **TaskCardEmpty** | `features/todos/components/task-card-empty.tsx` | 空任务占位卡（虚线框 + 提示 + 加号） | TimeBlock |
| **AddTaskRow** | `features/todos/components/add-task-row.tsx` | 添加任务入口行 | ProjectCard / InboxCard |
| **TodoCreateSheet** | `features/todos/components/todo-create-sheet.tsx` | 底部弹窗：快速创建待办 | 全局 |
| **TodoEditSheet** | `features/todos/components/todo-edit-sheet.tsx` | 底部弹窗：编辑待办详情 | 全局 |

### 4.3 组件详细规格

#### 4.3.1 TimeViewHeader

```
┌─────────────────────────────────────┐
│ 星期一              三月 2026  [📅] │
└─────────────────────────────────────┘
```

- 左侧：当前日期对应的星期，Noto Serif SC 28px bold
- 右侧：月份 + 年份（12px secondary）+ 日历图标按钮（32×32，点击打开完整日历选择器）
- 随 CalendarStrip 选中日期自动更新

#### 4.3.2 CalendarStrip（无限滚动日期条）

```
                    ← 可继续向左滑动（过去日期）
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│  一    二    三    四    五    六   日 │
│ [31]    1     2     3     4     5    6 │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
                    → 可继续向右滑动（未来日期，无限）
```

- **无限滚动**：以选中日为锚点，显示当前周 7 天；左右滑动可无限浏览前后日期
  - 实现方式：虚拟化渲染，预加载前后各 2 周（共 5 周 = 35 天），滑到边缘时动态追加
  - 滑动到新的一周时，TimeViewHeader 的星期/月份自动更新
- 选中日：bg-card + border，数字高亮为 text-primary
- 非选中日：透明背景，text-secondary
- 今天始终有红点标记（dot indicator），即使滑到其他周仍可见
- 点击某日 → 更新 selectedDate → TimeBlock 内容跟随切换
- 点击 TimeViewHeader 的日历图标 → 跳转到今天（快速回归）

#### 4.3.3 TimeBlock

```
┌─────────────────────────────────────┐
│  ☀ 上午 (2) ﹀                      │
├─────────────────────────────────────┤
│  ○ 准备周一会议的 PPT               │
│    🔗  📅 明天                       │
├─────────────────────────────────────┤
│  ○ 回复客户邮件                      │
│    🔗                                │
├ ─ ─ ─ ─ ─ 已完成 ─ ─ ─ ─ ─ ─ ─ ─ ┤
│  ✓ ~~发送日报~~          (opacity 50%)│
└─────────────────────────────────────┘

空状态：
┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
┆  上午要做什么？                  (+) ┆
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

- BlockHeader: 时段图标 + **中文标签**（随时/上午/下午/晚上）+ 计数(未完成数) + 折叠箭头
  - 标签用对应时段颜色 pill（圆角胶囊），如 `☀ 上午 (2) ﹀`
  - 折叠：点击 header 收起/展开任务列表（AnimatePresence）
- 有任务时：渲染 TaskItem 列表
  - **未完成任务在前**，正常样式
  - **已完成任务在后**，文字划线 + opacity 0.5，可折叠
- 无任务时：渲染 TaskCardEmpty（虚线边框 + 提示文案 + 右侧 + 按钮）
- 点击 + 按钮 → 打开 TodoCreateSheet，预填 scheduled_start 为对应时段

#### 4.3.4 ProjectView（水平轮播容器）

```
┌─────────────────────────────────────┐
│                                      │
│  ┌───────────────────────────────┐  │
│  │ 供应链优化 📦  3         [⋮]  │  │
│  ├───────────────────────────────┤  │
│  │  ○ 关于任务 (观看)            │  │
│  │    🔗  📅 明天                │  │
│  ├───────────────────────────────┤  │
│  │  ○ 获取桌面版 Todoist         │  │
│  │    当您在超过2个设备上...     │  │
│  │    🔗                         │  │
│  ├───────────────────────────────┤  │
│  │  ○ 查看任务                   │  │
│  │    🔗                         │  │
│  ├───────────────────────────────┤  │
│  │  + 添加任务                   │  │
│  └───────────────────────────────┘  │
│                                      │
│            ● ○ ○ ○                   │  ← PageDots 分页指示器
└─────────────────────────────────────┘
     ← 左滑：下一个项目    右滑：上一个项目 →
```

**ProjectView 容器**:
- 水平轮播（Swiper / snap scroll），每次显示一张 ProjectCard，占满宽度
- 左右滑动切换项目卡片，带弹性阻尼手感
- 底部 **PageDots 分页指示器**：圆点数量 = 项目数 + 1（"其他"），当前页实心，其余空心
- 卡片顺序：活跃项目按更新时间排序，"其他"分组固定在最后一页

**ProjectCard（单张卡片）**:
- ProjectHeader: 项目名 + emoji(可选) + 任务计数 + 更多按钮(⋮)
  - 更多菜单：编辑项目 / 归档 / 删除
- TaskItem 列表：项目下的 level=0 子任务（可滚动）
  - 未完成任务在前，已完成任务划线在后
- AddTaskRow：底部 + 添加任务（品牌红色），点击 → TodoCreateSheet（预填 parent_id）
- 无子任务时仍显示 AddTaskRow

**InboxCard（"其他"虚拟分组）**:
- header 显示"其他"+ 散装任务计数（无更多菜单）
- 列出所有 `parent_id = null && level = 0` 的散装任务
- 同样支持 AddTaskRow（创建时不设 parent_id）

#### 4.3.5 TaskItem（共用原子组件）

```
┌─────────────────────────────────────┐
│  ○  任务标题文本                     │
│     描述文本（可选，12px secondary） │
│     🔗  📅 明天  ⏱ 30分             │
└─────────────────────────────────────┘
```

- 左侧 checkbox：20×20 圆形，完成后打勾 + 文字划线 + 淡出动画
- 标题：14px text-primary，单行截断
- 描述（可选）：12px text-secondary，2 行截断
- Meta 行：链接图标 + 日期标签(deer 色) + 时长标签(可选)
- 点击任务行（非 checkbox）→ 打开 TodoEditSheet
- 长按 → 进入选择模式（未来扩展）

#### 4.3.6 TodoCreateSheet（新增）

```
┌─────────────────────────────────────┐
│  ─ (drag handle)                     │
│                                      │
│  [ 输入待办内容...              ]    │
│                                      │
│  📅 今天   ⏰ 上午   ⏱ 30分        │
│  📁 工作   🎯 供应链优化            │
│                                      │
│  [──────── 添加 ────────]           │
└─────────────────────────────────────┘
```

- 底部弹窗（Sheet），从底部滑入
- 文本输入框：自动聚焦，回车提交
- 快捷设置行：
  - 日期选择（默认=当前 selectedDate）
  - 时段选择（如从 TimeBlock 进入则预填）
  - 时长预设（15m/30m/1h/2h）
  - 领域选择（工作/学习/...）
  - 关联目标（如从 ProjectCard 进入则预填 parent_id）
- 添加按钮：提交后自动关闭，列表乐观更新

#### 4.3.7 TodoEditSheet（重构现有 DetailSheet）

在现有 TodoDetailSheet 基础上修复和增强：
- 修复时区 bug（scheduled_end 统一使用本地时间格式化）
- 增加文本编辑能力（标题可编辑）
- 增加目标关联选择器
- 子任务列表（显示 + 勾选 + 添加）
- AI action plan 可交互（勾选标记完成）
- 删除按钮

## 5. 场景规格（Given/When/Then）

### 场景 1: 时间视图 — 默认加载

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

### 场景 2: 时间视图 — 日期切换（无限滚动）

```
Given 时间视图已加载
When  用户点击 CalendarStrip 上的某一天
Then  该日期高亮
  And TimeViewHeader 更新为对应星期和月份
  And 4 个时段块刷新为该日期的任务

When  用户向右滑动 CalendarStrip 超出当前周
Then  自动加载下一周日期（无限向未来滚动）
  And 新一周的日期无缝衔接

When  用户向左滑动 CalendarStrip 超出当前周
Then  自动加载上一周日期（无限向过去滚动）

When  用户点击 TimeViewHeader 右侧的日历图标
Then  CalendarStrip 滚动回今天并选中
```

### 场景 3: 时间视图 — 时段折叠

```
Given 某时段块有 3 个任务
When  用户点击该时段的 BlockHeader
Then  任务列表收起（AnimatePresence 淡出 + 高度收缩）
  And 计数仍然显示
When  再次点击
Then  任务列表展开
```

### 场景 4: 时间视图 — 快速添加任务

```
Given 上午时段块显示空状态
When  用户点击空状态卡片的 + 按钮
Then  打开 TodoCreateSheet
  And 日期预填为当前 selectedDate
  And 时段预设为"上午"（scheduled_start 设为当日 09:00）
When  用户输入"准备会议 PPT"并提交
Then  Sheet 关闭
  And 上午时段块立即显示新任务（乐观更新）
  And 空状态卡片消失
```

### 场景 5: 项目视图 — 加载（水平轮播）

```
Given 用户点击右上角视图切换按钮
When  切换到项目视图
Then  显示第一个活跃项目的 ProjectCard（全宽）
  And 底部显示 PageDots 分页指示器（第一个圆点实心）
  And 圆点总数 = 活跃项目数 + 1（"其他"分组）
  And 卡片内列出该项目的子任务（parent_id = project.id, level = 0）
  And 已完成任务以划线形式显示在未完成之后
```

### 场景 5b: 项目视图 — 左右滑动切换

```
Given 项目视图显示第一个项目
When  用户向左滑动
Then  当前卡片滑出，下一个项目卡片滑入（弹性阻尼）
  And PageDots 更新为第二个圆点实心
When  用户滑到最后一页
Then  显示"其他"分组（InboxCard），列出所有散装任务
  And PageDots 最后一个圆点实心
When  用户继续向左滑动
Then  弹性回弹，不再前进（最后一页）
```

### 场景 6: 项目视图 — 完成任务

```
Given 项目"供应链优化"下有任务"回复客户邮件"
When  用户点击该任务的 checkbox
Then  checkbox 变为勾选状态
  And 任务文字添加删除线 + 透明度降低
  And 项目计数 -1（乐观更新）
  And 后端 PATCH done=true
  And 如果该项目下所有任务已完成，显示恭喜提示
```

### 场景 7: 项目视图 — 添加任务

```
Given 项目"供应链优化"的 ProjectCard
When  用户点击底部"+ 添加任务"
Then  打开 TodoCreateSheet
  And parent_id 预填为该项目 ID
  And 领域预填为该项目的 domain
When  用户输入并提交
Then  新任务出现在该 ProjectCard 的列表底部
```

### 场景 8: 视图切换

```
Given 用户在时间视图
When  点击右上角切换按钮
Then  时间视图淡出 + 向左平移
  And 项目视图淡入 + 从右平移
  And 切换按钮图标变化（表示当前视图类型）
When  再次点击
Then  切换回时间视图（反向动画）
```

### 场景 9: 任务详情编辑

```
Given 时间视图中某任务卡片
When  用户点击任务行（非 checkbox 区域）
Then  底部弹出 TodoEditSheet
  And 显示任务标题（可编辑）
  And 显示当前日期/时间/时长
  And 显示领域 + 影响度
  And 显示关联目标（如有）
  And 显示子任务列表（如有）
  And 显示 AI action plan（如有）
When  用户修改日期为明天并保存
Then  Sheet 关闭
  And 该任务从今天的时段块中消失
  And 乐观更新本地数据
```

### 场景 10: 空状态引导

```
Given 用户无任何待办
When  打开待办 Tab
Then  时间视图 4 个时段块全部显示空状态卡片
  And 每个空状态卡片显示对应时段的引导文案
  And 有明确的 + 添加入口
When  切换到项目视图
Then  显示温暖的空状态引导
  And 提示"录一条语音，路路会帮你整理待办"
  And 或提示"点击 + 创建你的第一个项目"
```

### 场景 11: 实时同步

```
Given 用户正在看待办时间视图
When  后端通过 AI digest 创建了一个新待办
  And WebSocket 推送 todo.created 事件
Then  新待办自动出现在对应时段块中
  And 有轻量入场动画
  And 时段计数 +1
```

### 场景 12: 已完成任务显示（划线保留）

```
Given 某时段有 3 个任务，其中 1 个已完成
When  渲染该时段块
Then  未完成任务正常显示在前
  And 已完成任务显示在后，文字划线 + opacity 50%
  And BlockHeader 计数只统计未完成数
  And 已完成区域可折叠（默认展开）

Given 项目视图中某项目有 5 个任务，其中 2 个已完成
When  渲染该 ProjectCard
Then  未完成任务在前，已完成任务划线在后
  And 项目 header 计数只统计未完成数
```

## 6. 待废弃组件

重构完成后删除以下文件：

| 文件 | 行数 | 替代 |
|------|------|------|
| `features/todos/components/todo-panel.tsx` | 539 | TimeView + ProjectView |
| `features/todos/components/todo-diary-card.tsx` | 255 | TimeView |
| `features/todos/components/today-gantt.tsx` | 298 | TimeView（CalendarStrip + TimeBlock） |
| `features/todos/components/todo-view.tsx` | 128 | TaskItem 在 sidebar 中直接使用 |
| `features/todos/hooks/use-todos.ts` | 60 | useTodoStore |
| `features/todos/hooks/use-today-todos.ts` | 80 | useTodoStore |

保留并重构：
| 文件 | 改动 |
|------|------|
| `features/todos/components/todo-detail-sheet.tsx` | 重构为 TodoEditSheet |
| `features/todos/lib/domain-config.ts` | 保留，增加时段配置 |
| `features/workspace/components/todo-workspace-view.tsx` | 简化为路由容器 |

## 7. 后端改动需求

### 7.1 新增 API：按日期查询待办

```
GET /api/v1/todos?date=2026-03-31

逻辑：
  WHERE (scheduled_start::date = $date OR (scheduled_start IS NULL AND created_at::date = $date))
    AND done = false
  UNION
  WHERE done = true AND completed_at::date = $date
  ORDER BY scheduled_start ASC NULLS FIRST
```

当前 `GET /api/v1/todos` 返回全量，增加 `date` 参数支持按日过滤，减少前端计算。

### 7.2 goal_title JOIN

确保 `findByDevice` / `findByUser` 的 SQL 中 LEFT JOIN parent todo 返回 `goal_title`：

```sql
SELECT t.*,
  parent.text AS goal_title,
  (SELECT count(*) FROM todo sub WHERE sub.parent_id = t.id) AS subtask_count,
  (SELECT count(*) FROM todo sub WHERE sub.parent_id = t.id AND sub.done = true) AS subtask_done_count
FROM todo t
LEFT JOIN todo parent ON t.parent_id = parent.id
WHERE t.user_id = $1 AND t.level = 0
```

## 8. E2E 测试（Playwright）

文件：`e2e/todo-ui-redesign.spec.ts`

基于现有 E2E 模式（`p1-onboarding-todo-feedback.spec.ts`），使用浏览器模拟全流程。

### 前置条件
- 前端 `pnpm dev`（localhost:3000）
- 后端 `cd gateway && pnpm dev`（localhost:3001）
- 使用系统 Chrome + 移动端视口 390×844

### E2E 场景清单

```
E2E-1: 待办 Tab 切换 + 时间视图默认加载
  → 点击顶部"待办"分段 → 可见时间视图
  → 验证 TimeViewHeader 显示今天星期
  → 验证 CalendarStrip 高亮今天
  → 验证 4 个时段块可见（随时/上午/下午/晚上）

E2E-2: CalendarStrip 日期选择 + 无限滚动
  → 点击明天的日期 → header 更新为明天的星期
  → 滑动 CalendarStrip 到下一周 → 新日期出现
  → 点击日历图标 → 回到今天

E2E-3: 时段块折叠/展开
  → 点击"上午"块 header → 任务列表收起（不可见）
  → 再次点击 → 任务列表展开（可见）

E2E-4: 快速创建待办（时间视图）
  → 点击"随时"时段的 + 按钮
  → TodoCreateSheet 弹出
  → 输入"测试待办E2E" → 点击添加
  → Sheet 关闭 → "随时"时段出现新任务

E2E-5: 完成待办（checkbox）
  → 点击某任务的 checkbox
  → 任务文字出现划线样式
  → 该任务移到已完成区域

E2E-6: 切换到项目视图
  → 点击右上角视图切换按钮
  → 时间视图消失，项目视图出现
  → 验证 PageDots 可见
  → 验证至少"其他"分组存在

E2E-7: 项目视图左右滑动
  → 如有多个项目，向左滑动
  → PageDots 更新（第二个点激活）
  → 向右滑回 → 第一个点激活

E2E-8: 项目视图创建待办
  → 在某个 ProjectCard 点击"+ 添加任务"
  → TodoCreateSheet 弹出
  → 输入"项目子任务E2E" → 提交
  → 新任务出现在该项目卡片内

E2E-9: 任务详情编辑
  → 点击某任务行（非 checkbox）
  → TodoEditSheet 弹出
  → 验证标题、日期等字段可见
  → 修改时段 → 保存 → Sheet 关闭

E2E-10: 视图切换回时间视图
  → 点击切换按钮 → 回到时间视图
  → 之前创建的任务可见

E2E-11: 实时同步（API 创建 → 前端自动出现）
  → 通过 API POST /api/v1/todos 创建一条任务
  → 前端自动出现新任务（轮询检测，最长 15s）
```

### 测试实现模式

```typescript
test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

test.describe.serial("待办 UI 重构 E2E", () => {
  // 共享状态
  let page: Page;

  test("E2E-1: 时间视图默认加载", async ({ page: p }) => {
    page = p;
    await page.goto("/");
    // 登录（复用 auth helper）
    // 点击待办 Tab
    await page.locator('[data-testid="segment-todo"]').click();
    // 验证时间视图
    await expect(page.locator('[data-testid="time-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="time-view-header"]')).toContainText(/星期/);
    // 验证 4 个时段块
    for (const slot of ['随时', '上午', '下午', '晚上']) {
      await expect(page.locator(`text=${slot}`)).toBeVisible();
    }
  });

  test("E2E-4: 快速创建待办", async () => {
    // 点击随时时段的 + 按钮
    await page.locator('[data-testid="time-block-anytime"] [data-testid="add-btn"]').click();
    // Sheet 弹出
    await expect(page.locator('[data-testid="todo-create-sheet"]')).toBeVisible();
    // 输入
    await page.locator('[data-testid="todo-input"]').pressSequentially("测试待办E2E", { delay: 10 });
    await page.locator('[data-testid="todo-submit"]').click();
    // 验证
    await expect(page.locator('[data-testid="todo-create-sheet"]')).not.toBeVisible();
    await expect(page.locator('text=测试待办E2E')).toBeVisible();
  });

  // ... 其他测试用例
});
```

## 9. 实施计划

```
Phase 1: 数据层修复
  - TodoDTO 类型定义
  - API 客户端重写（类型安全）
  - useTodoStore 统一 hook
  - 后端 date 参数支持

Phase 2: 原子组件
  - TaskItem（共用）
  - TaskCardEmpty
  - AddTaskRow
  - TodoCreateSheet

Phase 3: 时间视图
  - TimeViewHeader
  - CalendarStrip（无限滚动）
  - TimeBlock（中文标签 + 已完成划线区）
  - TimeView 组装

Phase 4: 项目视图
  - ProjectCard + InboxCard
  - ProjectView（水平轮播 + PageDots）

Phase 5: 编辑层 + 集成
  - TodoEditSheet（重构 DetailSheet）
  - 视图切换动画
  - 实时同步（WebSocket）
  - 集成到 page.tsx

Phase 6: E2E 测试
  - e2e/todo-ui-redesign.spec.ts
  - 11 个场景全覆盖

Phase 7: 清理
  - 删除旧组件（6 个文件）
  - 更新 spec + roadmap 状态
```
