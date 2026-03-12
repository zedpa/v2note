## gene_todo_panel
### 功能描述
待办看板。右侧 3/4 屏滑出面板，三 Tab 看板整合今日任务时间轴、全部待办（按领域分组）和长期目标。从首页 Header 右侧"待办"按钮一键打开。

### 详细功能
- 功能1：右侧滑出 3/4 宽度面板（`w-[75vw] max-w-md`），半透明遮罩，点击遮罩关闭
- 功能2：三个 Tab — 今日（Clock）/ 全部（Briefcase）/ 目标（Target）
- 功能3：**今日 Tab** — 迷你时间轴（08-20点），当前时间红点指示线，scheduled 任务按时间定位，底部展示未排期任务
- 功能4：**全部 Tab** — 进度条（待办/完成比例），按 domain 分组（work/life/social/learning/health），组内按 impact 降序
- 功能5：**目标 Tab** — 优先从 goal 表加载目标树（显示来源+状态），goal 表为空时 fallback 到 AI 记忆 `[目标]` 前缀条目
- 功能6：CompactTodoRow — 紧凑行样式，左侧 domain 色条，勾选切换，ai_actionable 紫色背景+紫色 sparkle 图标，ImpactDots 火焰可视化
- 功能7：点击待办文本打开 TodoDetailSheet 底部弹窗（日期/时间设置、时长快选、AI 执行计划）
- 功能8：已完成项折叠显示（最多 8 条）
- 功能9：**TodoDetailSheet** — 底部弹窗详情编辑：drag handle、淡色域名图标、showPicker() 日期/时间选择（友好格式：今天/明天/X月X日 周X）、4档时长快选+自定义输入(min)、域名标签+目标关联标记、AI 执行计划步骤列表、深色保存按钮+pb-safe、"让AI帮忙"入口
- 功能10：**ImpactDots 火焰可视化** — 1-3 隐藏、4-6 数字标签、7-8 Flame 火焰图标、9-10 脉冲火焰动画

### Header 入口
- 左侧：头像按钮（打开侧边栏）+ 洞察按钮（Sparkles 图标，打开 review overlay）
- 右侧：搜索按钮 + 待办按钮（ListChecks 图标，打开 TodoPanel）

### 关键文件
- `features/todos/components/todo-panel.tsx` — 三 Tab 看板主组件（TodayTab/AllTodosTab/GoalsTab）
- `features/todos/components/todo-diary-card.tsx` — 旧全屏版（保留兼容，NudgeToast 等仍可引用）
- `features/todos/hooks/use-todos.ts` — 全部待办 hook
- `features/todos/hooks/use-today-todos.ts` — 今日待办 hook
- `features/todos/lib/domain-config.ts` — DOMAIN_CONFIG 配色+图标映射
- `features/todos/components/impact-dots.tsx` — 影响力火焰可视化（1-3隐藏/4-6数字/7-8火焰/9-10脉冲火焰）
- `features/todos/components/todo-detail-sheet.tsx` — 底部弹窗详情编辑（日期时间+时长+AI计划）
- `shared/components/new-header.tsx` — Header 组件（洞察+待办双入口）
- `shared/lib/api/goals.ts` — listGoals API（目标 Tab 主数据源）
- `shared/lib/api/memory.ts` — listMemories API（目标 Tab fallback 数据源）
- `app/page.tsx` — TodoPanel open 状态绑定 activeOverlay==="todos"

### 测试描述
- 输入：点击 Header 右侧"待办"按钮
- 输出：右侧滑出 3/4 面板，默认显示"今日"Tab 时间轴
- 输入：切换到"全部"Tab
- 输出：按领域分组显示所有待办，进度条显示完成比例
- 输入：切换到"目标"Tab（有 goal 表数据时）
- 输出：显示目标列表，带来源标签（语音/对话/手动）和状态
- 输入：切换到"目标"Tab（goal 表为空时）
- 输出：fallback 显示 AI 记忆中的 [目标] 条目，带重要性评分
