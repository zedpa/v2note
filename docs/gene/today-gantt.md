## gene_today_gantt

> ⏸ **入口已隐藏（2026-03-29）** — TodayGantt 组件保留，但 page.tsx 中的 `today-todo` overlay 入口已移除。待 UX 验证后恢复。

### 功能描述
/today-todo 命令触发的甘特图风格今日任务时间轴，按领域配色，标识 AI 可协助项。

### 详细功能
- 功能1：6am-midnight 时间网格
- 功能2："现在"红线指示器
- 功能3：任务块按 scheduled_start/end 或估算时间定位
- 功能4：未排期任务自动排布
- 功能5：点击切换完成状态
- 功能6：任务块按 domain 配色（work=blue, life=green, social=amber, learning=cyan, health=rose）
- 功能7：ai_actionable 未完成项显示 Sparkles 星火图标

### 关键文件
- `features/todos/components/today-gantt.tsx` — DOMAIN_COLORS 映射
- `features/todos/hooks/use-today-todos.ts` — 传递 domain/impact/ai_actionable 字段

### 测试描述
- 输入：输入 /today-todo
- 输出：甘特图显示今日任务，工作任务蓝色、生活任务绿色，AI可协助项有星火标识
