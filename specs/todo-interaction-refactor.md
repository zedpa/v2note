---
status: superseded
superseded_by: "todo-system.md"
---

# 待办交互重构

> 状态：🟡 待开发

## 概述
待办系统交互全面升级：TaskItem 左右滑动操作、项目视图瀑布流重做、优先级编辑器、月历展开。按优先级分批实施。

## 批次规划

| 批次 | 内容 | 优先级 |
|------|------|--------|
| **P0** | TaskItem 左右滑动手势 + 撤销 Toast + 触觉反馈 | 本次实施 |
| **P1** | 项目视图瀑布流网格 | 本次实施 |
| **P2** | 优先级编辑器 + 创建表单增强 + 后端 tool 同步 | 本次实施 |
| **P3** | 月历展开 + 三色圆点 + 周历滑动切换 | 本次实施 |
| P4 | 拖拽排序（远期，依赖 P0 完成） | 远期 |

---

## P0: TaskItem 滑动手势

### 交互设计

```
正常状态：
┌─────────────────────────────┐
│ ○ ●  明天找张总确认报价       │
│      今天 · 供应链优化        │
└─────────────────────────────┘

← 左滑（露出操作按钮）：
┌───────────────────────┬────┬────┐
│ ○  明天找张总确认报..   │ 推迟 │ 删除 │
│                       │ 蓝  │ 红  │
└───────────────────────┴────┴────┘

→ 右滑（快速完成）：
┌────┬─────────────────────────┐
│ ✓  │  明天找张总确认报价       │
│ 绿  │  (松手后标记完成)        │
└────┴─────────────────────────┘
```

### 场景 0.1: 左滑露出操作按钮
```
假设 (Given)  用户看到一条未完成的待办
当   (When)   手指从右往左滑动超过 60px
那么 (Then)   待办卡片向左平移，露出右侧操作按钮区
并且 (And)    操作区包含"推迟"（蓝色）和"删除"（红色）两个按钮
并且 (And)    松手后卡片保持在滑开状态（不自动回弹）
```

### 场景 0.2: 左滑 — 推迟操作
```
假设 (Given)  待办已左滑露出操作区
当   (When)   用户点击"推迟"按钮
那么 (Then)   待办的 scheduled_start 推迟到明天同一时间
并且 (And)    卡片自动回弹到正常位置
并且 (And)    如果当前在今日视图，该待办从列表中消失（因为日期变了）
```

### 场景 0.3: 左滑 — 删除操作
```
假设 (Given)  待办已左滑露出操作区
当   (When)   用户点击"删除"按钮
那么 (Then)   显示确认提示（底部 toast 或内联确认）
并且 (And)    确认后删除待办（调用 apiDeleteTodo）
并且 (And)    列表中移除该条目（带滑出动画）
```

### 场景 0.4: 右滑快速完成 + 撤销 Toast
```
假设 (Given)  用户看到一条未完成的待办
当   (When)   手指从左往右滑动超过 80px
那么 (Then)   露出左侧绿色完成区域（显示 ✓ 图标）
并且 (And)    松手后自动标记完成（调用 onToggle）
并且 (And)    卡片带完成动画（缩小淡出或划线效果）
并且 (And)    底部弹出撤销 Toast："已完成「找张总确认报价」 [撤销]"
并且 (And)    3 秒内点撤销可恢复为未完成，超时后 Toast 消失
并且 (And)    Capacitor 环境下触发成功震动（UINotificationFeedbackType.Success）
```

### 场景 0.4b: 左滑删除 + 撤销 Toast
```
假设 (Given)  用户点击左滑操作区的"删除"按钮并确认
当   (When)   待办被删除
那么 (Then)   底部弹出撤销 Toast："已删除「找张总确认报价」 [撤销]"
并且 (And)    3 秒内点撤销可恢复，超时后永久删除
并且 (And)    Capacitor 环境下触发警告震动（UINotificationFeedbackType.Warning）
```

### 场景 0.5: 滑动超过阈值 — 触觉反馈
```
假设 (Given)  用户正在滑动待办卡片
当   (When)   滑动距离首次超过阈值（60px 左滑 / 80px 右滑）
那么 (Then)   Capacitor 环境下触发轻微震动（UIImpactFeedbackStyle.Light）
并且 (And)    提示用户"再滑一点就触发操作"
```

### 场景 0.6: 滑动不足阈值 — 回弹
```
假设 (Given)  用户开始滑动待办卡片
当   (When)   滑动距离 < 60px（左滑）或 < 80px（右滑）
那么 (Then)   松手后卡片弹性回到原位
并且 (And)    不触发任何操作
```

### 场景 0.7: 已完成待办不支持右滑
```
假设 (Given)  待办已标记为完成（done=true）
当   (When)   用户右滑该待办
那么 (Then)   不触发完成操作（已完成无需再完成）
并且 (And)    左滑仍可用（可删除已完成的待办）
```

### 场景 0.8: 同一时刻只能有一个卡片处于滑开状态
```
假设 (Given)  待办 A 已左滑处于打开状态
当   (When)   用户开始滑动待办 B
那么 (Then)   待办 A 自动回弹关闭
并且 (And)    待办 B 正常响应滑动
```

### 技术方案

**实现方式：** 纯 CSS transform + touch event（不引入第三方手势库）

```
新建 features/todos/components/swipeable-task-item.tsx
- 包裹 TaskItem，提供滑动层
- 内部状态：offsetX（当前位移）, phase（idle | swiping | open）
- touch 事件三段：touchStart → touchMove → touchEnd
- CSS transition 控制回弹/吸附动画
```

**阈值常量：**
```typescript
const LEFT_THRESHOLD = 60;    // 左滑吸附阈值
const RIGHT_THRESHOLD = 80;   // 右滑完成阈值
const ACTION_WIDTH = 120;     // 左滑操作区总宽度（两个按钮各 60px）
```

### 修改文件

| 文件 | 操作 |
|------|------|
| `features/todos/components/swipeable-task-item.tsx` | **新建** — 滑动包装组件（含触觉反馈） |
| `features/todos/components/time-block.tsx` | 改 — 用 SwipeableTaskItem 替换 TaskItem |
| `features/todos/components/project-card.tsx` | 改 — 同上 |
| `features/todos/hooks/use-todo-store.ts` | 改 — 新增 postpone(id) 和 remove(id) 方法 |
| `features/todos/hooks/use-undo-toast.ts` | **新建** — 撤销 Toast 逻辑（3秒倒计时 + 恢复） |
| `shared/lib/api/todos.ts` | 确认 — 需要 deleteTodo / updateTodo API |
| `shared/lib/haptics.ts` | **新建** — Capacitor 触觉反馈封装（非 Capacitor 环境静默降级） |

---

## P1: 项目视图 — 瀑布流网格

### 交互设计

```
┌──────────────┐  ┌────────────────┐
│ 📦 收集箱 3/4 │  │ 🎬 自媒体  4/6  │
│──────────────│  │────────────────│
│ ○ 整理衣服  ★│  │ ○ 剪辑视频   ★│
│ ● 订购桶装水  │  │ ○ 发图文笔记  ★│
│ ○ 洗衣服    │  │ ○ 选题计划     │
│ + 添加待办   │  │ ○ 学写文章   ★│
└──────────────┘  │ + 添加待办     │
┌──────────────┐  └────────────────┘
│ 💼 工作  2/3 │  ┌────────────────┐
│──────────────│  │ 📚 看书   3/6  │
│ ○ ASO学习   │  │────────────────│
│ ○ 设计原型  ★│  │ ○ 飘          │
│ + 添加待办   │  │ ○ 活着         │
└──────────────┘  │ + 添加待办     │
                  └────────────────┘
```

### 场景 1.1: 瀑布流双列布局
```
假设 (Given)  用户切换到项目视图
当   (When)   有多个活跃项目
那么 (Then)   项目卡片以双列瀑布流排列
并且 (And)    每张卡片高度自适应内容（未完成任务数决定高度）
并且 (And)    左右列交替放置卡片，短列优先
并且 (And)    "其他"（无项目归属的散装任务）作为最后一张卡片
```

### 场景 1.2: 卡片颜色区分
```
假设 (Given)  项目视图显示多个项目卡片
当   (When)   渲染卡片
那么 (Then)   每张卡片有独立的主题色（头部背景色 + 文字色）
并且 (And)    颜色从预定义调色板轮流分配（不重复相邻色）
并且 (And)    暗色模式下自动调整为低饱和度版本
```

### 场景 1.3: 卡片头部显示进度
```
假设 (Given)  项目"自媒体"有 6 个待办，4 个已完成
当   (When)   显示该项目卡片
那么 (Then)   头部显示"🎬 自媒体  4/6"（已完成/总数）
并且 (And)    头部带主题色背景
```

### 场景 1.4: 卡片内待办列表
```
假设 (Given)  用户查看一张项目卡片
当   (When)   该项目有 5 条未完成待办
那么 (Then)   最多显示 5 条未完成待办（更多则截断 + "还有 N 条"）
并且 (And)    已完成的待办默认折叠，显示"N 条已完成"可展开
并且 (And)    每条待办右侧显示优先级星标（priority >= 4 时）
并且 (And)    底部有"+ 添加待办"入口
```

### 场景 1.5: 点击卡片展开全屏
```
假设 (Given)  用户点击项目卡片头部
当   (When)   卡片展开
那么 (Then)   全屏展示该项目的所有待办（类似参考图右侧）
并且 (And)    全屏视图支持左右滑动切换项目
并且 (And)    顶部显示项目名 + 颜色主题
并且 (And)    可以从全屏视图返回瀑布流（向下滑或点返回）
```

### 场景 1.6: 卡片内操作
```
假设 (Given)  用户在瀑布流中看到项目卡片
当   (When)   点击卡片内的某条待办
那么 (Then)   打开编辑 Sheet（与时间视图行为一致）
当   (When)   点击复选框
那么 (Then)   切换待办完成状态（乐观更新）
当   (When)   点击"+ 添加待办"
那么 (Then)   打开创建 Sheet，自动关联该项目
```

### 调色板

```typescript
const PROJECT_COLORS = [
  { bg: "bg-violet-100 dark:bg-violet-900/30",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-800" },
  { bg: "bg-rose-100 dark:bg-rose-900/30",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800" },
  { bg: "bg-amber-100 dark:bg-amber-900/30",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200 dark:border-amber-800" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  { bg: "bg-sky-100 dark:bg-sky-900/30",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-200 dark:border-sky-800" },
  { bg: "bg-pink-100 dark:bg-pink-900/30",       text: "text-pink-700 dark:text-pink-300",       border: "border-pink-200 dark:border-pink-800" },
  { bg: "bg-teal-100 dark:bg-teal-900/30",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-200 dark:border-teal-800" },
  { bg: "bg-orange-100 dark:bg-orange-900/30",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-800" },
];
```

### 修改文件

| 文件 | 操作 |
|------|------|
| `features/todos/components/project-view.tsx` | **重写** — 轮播改瀑布流 |
| `features/todos/components/project-card.tsx` | **重写** — 加颜色、进度、截断 |
| `features/todos/components/project-detail-sheet.tsx` | **新建** — 全屏项目详情 |
| `features/todos/lib/project-colors.ts` | **新建** — 调色板定义 |
| `features/todos/components/page-dots.tsx` | 删除 — 不再需要分页指示器 |

---

---

## P2: 优先级编辑器

### 现状断裂分析

```
后端：priority 字段完整（1-5, 存储/返回/AI提取均正常）
API：update 支持 priority，create 缺失 priority 参数
前端：TaskItem 显示色点 ✅ | 创建表单无 ❌ | 编辑表单无 ❌ | 详情表单无 ❌
```

### 交互设计

```
优先级选择器（内联横排，非弹窗）：

  ○ 低   ● 中   ○ 高   ○ 紧急
  灰     默认    橙     红

选中状态用实心圆 + 对应颜色背景 pill
未选中为空心圆 + 灰色文字
默认值"中"（priority=3），不选等同于中
```

### 场景 2.1: 创建待办时设置优先级
```
假设 (Given)  用户打开创建待办 Sheet
当   (When)   输入待办文本
那么 (Then)   文本下方显示优先级选择器（低/中/高/紧急）
并且 (And)    默认选中"中"
并且 (And)    用户可点击切换优先级
并且 (And)    提交时 priority 值一起传给 API（1=低, 3=中, 4=高, 5=紧急）
```

### 场景 2.2: 编辑待办时修改优先级
```
假设 (Given)  用户点击待办打开编辑 Sheet
当   (When)   Sheet 加载
那么 (Then)   显示优先级选择器，回显当前优先级
并且 (And)    用户修改优先级后实时保存（与其他字段一致）
```

### 场景 2.3: 详情页显示优先级
```
假设 (Given)  用户打开待办详情 Sheet
当   (When)   待办 priority=5
那么 (Then)   在 Impact badge 旁显示"紧急"标签（红色）
并且 (And)    优先级选择器可编辑
```

### 场景 2.4: 创建表单增加时长和项目选择
```
假设 (Given)  用户打开创建待办 Sheet
当   (When)   输入待办文本后
那么 (Then)   显示快捷标签行：
             📅 日期  ⏰ 时段  ⏱ 时长  📂 项目
并且 (And)    时长可选 15分/30分/1小时/2小时（同编辑表单）
并且 (And)    项目可选已有项目列表（下拉或 Sheet）
并且 (And)    优先级在标签行下方单独一行
```

### 场景 2.5: 后端 create_todo tool 同步支持 priority
```
假设 (Given)  用户通过语音/对话创建待办，AI 提取到 priority
当   (When)   调用 create_todo tool handler
那么 (Then)   priority 字段被正确写入数据库
并且 (And)    前端 API createTodo 也支持 priority 参数
并且 (And)    与前端创建表单行为一致
```

### 场景 2.6: 项目选择与项目视图一致
```
假设 (Given)  用户在创建表单选择"项目：工作"
当   (When)   待办创建成功
那么 (Then)   该待办的 parent_id 指向"工作"项目
并且 (And)    在项目视图的"工作"卡片中立即出现该待办
并且 (And)    创建表单的项目列表来源与项目视图相同（use-todo-store 的 projects）
```

### 优先级值映射

| UI 标签 | priority 值 | 色点 | 说明 |
|---------|------------|------|------|
| 低 | 1 | 不显示 | "不着急""有空再做" |
| 中 | 3 | 不显示 | 默认值，无信号时 |
| 高 | 4 | 橙色 `bg-orange-400` | "挺急的" |
| 紧急 | 5 | 红色 `bg-red-500` | "今天必须""非常紧急" |

### 修改文件

| 文件 | 操作 |
|------|------|
| `features/todos/components/priority-selector.tsx` | **新建** — 优先级选择器组件（三处复用） |
| `features/todos/components/todo-create-sheet.tsx` | 改 — 加入优先级 + 时长 + 项目选择 |
| `features/todos/components/todo-edit-sheet.tsx` | 改 — 加入优先级选择器 |
| `features/todos/components/todo-detail-sheet.tsx` | 改 — 加入优先级显示和编辑 |
| `shared/lib/api/todos.ts` | 改 — createTodo 参数增加 priority |
| `features/todos/hooks/use-todo-store.ts` | 改 — create 方法增加 priority；项目列表供创建表单复用 |
| `gateway/src/tools/definitions/create-todo.ts` | 确认 — tool handler 已支持 priority（上轮已修复） |

---

## P3: 月历展开 / 周月切换

### 现状分析

```
已有：
- CalendarStrip：7 天周视图（自定义组件）
- shadcn/ui Calendar：基于 react-day-picker 的月历组件（已安装，未使用）
- TimeViewHeader：显示星期 + 月年，有"今天"按钮，无展开功能

缺失：
- 月视图
- 周/月切换交互
- 有待办的日期标记（日历上的小圆点）
```

### 交互设计

```
收起状态（默认）：
┌─── 星期四 ──────── 4月 2026 📅 ─┐
│ 一  二  三  [四]  五  六  日    │
│ 30  31   1  [2]   3   4   5    │
└─────────────────────────────────┘

          ↕ 点击 📅 或下拉手势

展开状态（月历）：
┌─── 4月 2026 ──── < > ──── ✕ ──┐
│ 一  二  三  四  五  六  日     │
│        1   [2]  3   4   5     │
│  6   7   8   9  10  11  12    │
│ 13  14  15  16  17  18  19    │
│ 20  21  22  23  24  25  26    │
│ 27  28  29  30               │
└─────────────────────────────────┘
  有待办的日期下方有小圆点标记 ●
```

### 场景 3.1: 点击日历图标展开月历
```
假设 (Given)  用户在时间视图看到周历条
当   (When)   点击右上角的日历图标 📅
那么 (Then)   周历条动画展开为完整月历
并且 (And)    月历使用已有 shadcn/ui Calendar 组件
并且 (And)    当前选中日期高亮
并且 (And)    今天日期有特殊标记
并且 (And)    有待办的日期下方显示小圆点
```

### 场景 3.2: 月历中选择日期
```
假设 (Given)  月历已展开
当   (When)   用户点击某个日期（如 4月15日）
那么 (Then)   选中日期更新为 4月15日
并且 (And)    月历自动收起回周历条
并且 (And)    时间视图刷新显示该日的待办
```

### 场景 3.3: 月历中切换月份
```
假设 (Given)  月历已展开，当前显示 4月
当   (When)   用户点击右箭头 >
那么 (Then)   月历切换到 5月
并且 (And)    小圆点标记更新为 5月有待办的日期
```

### 场景 3.4: 收起月历
```
假设 (Given)  月历已展开
当   (When)   用户点击关闭按钮 ✕ 或再次点击日历图标
那么 (Then)   月历动画收起为周历条
并且 (And)    周历条显示当前选中日期所在的一周
```

### 场景 3.5: 周历条左右滑动切换周
```
假设 (Given)  用户在周历条（收起状态）
当   (When)   手指从右往左滑动
那么 (Then)   周历条切换到下一周
并且 (And)    选中日期变为下周同一星期几
当   (When)   手指从左往右滑动
那么 (Then)   周历条切换到上一周
并且 (And)    选中日期变为上周同一星期几
```

### 场景 3.6: 下拉手势展开（可选增强）
```
假设 (Given)  用户在周历条区域
当   (When)   从周历条向下拖拽超过 40px
那么 (Then)   月历展开（与点击图标效果一致）
当   (When)   从月历向上拖拽超过 40px
那么 (Then)   月历收起
```

### 场景 3.7: 日期状态圆点 — 三色系统
```
日期下方的小圆点根据该日待办状态显示不同颜色：

  🔴 红点 — 有新待办，用户尚未查看过该日期
  🟢 绿点 — 有未完成待办，用户已查看过（点击过该日期）
  🟡 黄点 — 有过期未完成待办（scheduled_start < 今天 且 done=false）
  无点   — 该日无待办，或所有待办已完成
```

### 场景 3.8: 红点 → 新待办未查看
```
假设 (Given)  用户安排了一条 3 天后的待办（如 4月5日）
当   (When)   月历或周历显示 4月5日
那么 (Then)   4月5日下方显示红色小圆点
并且 (And)    表示该日期有待办但用户尚未点击查看过
```

### 场景 3.9: 红点变绿点 — 用户已查看
```
假设 (Given)  4月5日显示红点
当   (When)   用户点击 4月5日，切换到该日的日视图
那么 (Then)   红点变为绿点
并且 (And)    表示用户已看过该日的待办
并且 (And)    "已查看"状态持久化到 localStorage
```

### 场景 3.10: 黄点 — 过期待办
```
假设 (Given)  今天是 4月5日，4月3日有一条未完成待办
当   (When)   月历或周历显示 4月3日
那么 (Then)   4月3日下方显示黄色小圆点
并且 (And)    表示该日有过期未完成的待办
并且 (And)    黄点优先级最高（即使用户查看过，只要过期就显示黄点）
```

### 圆点优先级规则

```
判定顺序（高→低）：
1. 该日所有待办已完成 → 无点
2. 该日有过期未完成待办（date < today && !done）→ 🟡 黄点
3. 该日有未完成待办 + 用户未查看过 → 🔴 红点
4. 该日有未完成待办 + 用户已查看过 → 🟢 绿点
5. 该日无待办 → 无点
```

### 技术方案

```
1. TimeViewHeader 日历图标改为展开/收起 toggle
2. CalendarStrip 增加左右滑动手势切换周
3. 新建 CalendarExpand 组件：
   - 展开时渲染 shadcn/ui <Calendar>（react-day-picker）
   - 收起时渲染现有 <CalendarStrip>
   - CSS max-height + transition 做展开/收起动画
4. 日期圆点数据源：
   - useTodoStore 导出 computeDateDots(allTodos, viewedDates, today)
   - viewedDates: Set<string> 持久化到 localStorage（key: "v2note:viewed-dates"）
   - 用户切换日期时 → viewedDates.add(dateStr)
   - 返回 Map<string, "red" | "green" | "yellow">
5. react-day-picker modifiers 注入：
   - modifiers={{ red: redDates, green: greenDates, yellow: yellowDates }}
   - modifiersStyles 对应三种颜色的小圆点样式
```

### 修改文件

| 文件 | 操作 |
|------|------|
| `features/todos/components/calendar-expand.tsx` | **新建** — 月历展开容器 |
| `features/todos/components/calendar-strip.tsx` | 改 — 增加左右滑动切换周 + 日期圆点 |
| `features/todos/components/time-view-header.tsx` | 改 — 日历图标改为展开 toggle |
| `features/todos/components/time-view.tsx` | 改 — 集成 CalendarExpand；切换日期时记录 viewedDates |
| `features/todos/lib/date-dots.ts` | **新建** — 日期圆点计算逻辑 |
| `features/todos/hooks/use-todo-store.ts` | 改 — 导出 dateDots 供日历组件使用 |
| `features/todos/hooks/use-viewed-dates.ts` | **新建** — localStorage 持久化已查看日期 |

---

## 全局边界条件

- [ ] **P0** 滑动与纵向滚动冲突：水平位移 > 垂直位移时才进入滑动模式
- [ ] **P0** 已完成待办不支持右滑完成，左滑仍可删除
- [ ] **P0** 同一时刻只能有一个卡片处于滑开状态
- [ ] **P1** 瀑布流 0 个项目 → 空状态
- [ ] **P1** 瀑布流 1 个项目 → 单列居中
- [ ] **P1** 项目全部完成 → 卡片仍显示，标题后 ✓
- [ ] **P2** 创建 API 目前不支持 priority → 需要补参数
- [ ] **P2** priority=null 与 priority=3 视为等价（默认中优先级）
- [ ] **P2** 项目列表来源统一：创建表单和项目视图使用同一份 projects 数据
- [ ] **P3** viewedDates 持久化用 localStorage，登录态切换时可能残留 → key 含 userId
- [ ] **P3** viewedDates 定期清理：超过 60 天的记录自动移除，防止无限膨胀
- [ ] **P3** 过期待办黄点优先级最高：即使用户看过，过期仍显示黄点（提醒处理）
- [ ] **P3** 周历滑动与 P0 卡片滑动共存：周历区域的滑动不触发卡片操作
- [ ] **P3** 月历在小屏上的宽度适配（react-day-picker 默认 9*7=63 个格子）

---

## 补充建议（可选增强）

### 建议 1: 右滑完成 + 撤销 Toast
```
用户右滑完成待办后，底部弹出 toast：
  "已完成「找张总确认报价」   [撤销]"
3 秒内点撤销可恢复，超时后 toast 消失。
防止误操作，比确认弹窗更流畅。
```

### 建议 3: Capacitor 触觉反馈
```
在移动端（Capacitor）环境下：
- 滑动超过阈值时触发轻微震动（UIImpactFeedbackStyle.Light）
- 完成操作时触发成功震动（UINotificationFeedbackType.Success）
- 删除确认时触发警告震动（UINotificationFeedbackType.Warning）
可用 @capacitor/haptics 插件，已有 Capacitor 环境无需额外配置。
```

### P4（远期）: 拖拽排序
```
长按待办条目 → 进入拖拽模式 → 调整同一时段/项目内的顺序。
需要后端加 sort_order 字段。
依赖 P0 滑动手势完成后再做（避免手势冲突）。
```

## 依赖
- P0/P1: 无新第三方依赖（纯 touch event + CSS）
- P2: 无新依赖
- P3: 已有 `react-day-picker` + shadcn/ui `Calendar`，无需安装
- 建议 3: `@capacitor/haptics`（可选，Capacitor 已集成）

## 备注
- P0~P3 可分批实施，也可并行（互不依赖）
- 参考设计：MarkTodo 瀑布流网格 + 颜色系统
- 优先级选择器设计为独立组件 `PrioritySelector`，创建/编辑/详情三处复用
- 日期圆点逻辑独立为 `date-dots.ts`，方便单元测试
