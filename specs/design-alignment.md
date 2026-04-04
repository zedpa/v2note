---
id: "073"
title: "设计对齐 — Phase 8 P1 Spec"
status: completed
domain: design
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 设计对齐 — Phase 8 P1 Spec

> 状态：🟡 待开发
> 来源：2026-03-28 全量设计图审计（21张） + 全链路测试（156条flomo导入）
> 设计图目录：`docs/designs/01~21-*.png`

## 概述

公测前对齐设计稿，修复全链路测试发现的功能/视觉差距。分为 9 个独立场景组，按优先级排列。

---

## 场景组 1: 日记卡片 AI 分析（journal-card-insight）

> 对标设计图 09-journal-card-expanded.png
> 文件：`features/notes/components/notes-timeline.tsx`

### 场景 1.1: 展开卡片显示 AI 要点
```
假设 (Given)  用户在日记时间线，某条记录已被 AI 处理（有 strike 数据）
当   (When)   用户点击卡片展开
那么 (Then)   卡片下方显示"要点"区域，列出该记录关联的 strike nucleus（最多3条）
并且 (And)    每条要点前有圆点标记，文字为 sm 灰色
```

### 场景 1.2: 展开卡片显示行动提取
```
假设 (Given)  该记录有 AI 提取的 todo
当   (When)   卡片展开
那么 (Then)   "要点"下方显示"行动"区域，列出提取的待办（带 checkbox 图标，不可操作）
并且 (And)    最多显示 3 条，超出显示"+N 条"
```

### 场景 1.3: "和路路聊聊这条"按钮
```
假设 (Given)  卡片已展开
当   (When)   用户点击底部"和路路聊聊这条"按钮
那么 (Then)   打开聊天 overlay，初始消息包含该记录的内容摘要
```

### 场景 1.4: 无 AI 数据时不显示分析区域
```
假设 (Given)  该记录未被 AI 处理（无 strike/todo）
当   (When)   卡片展开
那么 (Then)   只显示原文内容，不显示要点/行动区域
```

### 接口约定

输入：需要为每条 record 加载关联的 strike 和 todo 数据
```typescript
// GET /api/v1/records/:id 已返回 todos 数组
// 需新增：返回关联的 strikes（通过 record → transcript → digest → strike 链路）
// 或前端从 /api/v1/strikes?record_id=xxx 获取
```

---

## 场景组 2: 认知统计重构（cognitive-stats-redesign）

> 对标设计图 15-cognitive-stats.png
> 文件：`features/sidebar/components/stats-dashboard.tsx`

### 场景 2.1: 极性分布图
```
假设 (Given)  用户有 5 条以上记录
当   (When)   打开认知统计页
那么 (Then)   顶部显示"极性分布"标题
并且 (And)    显示饼图/环形图，分为 感知(perceive)/判断(judge)/领悟(realize) 三类
并且 (And)    每类用不同颜色，图例在图表下方
```

### 场景 2.2: 关键指标卡片
```
假设 (Given)  用户有认知数据
当   (When)   查看统计页
那么 (Then)   极性图下方显示三个指标卡片：领悟滞后（天）/ 本月记录 / 矛盾数
并且 (And)    每个卡片用大号 serif 数字 + 小号标签文字
```

### 场景 2.3: Top Clusters 列表
```
假设 (Given)  batch-analyze 已生成 cluster 数据
当   (When)   查看统计页
那么 (Then)   指标卡片下方显示"Top Clusters"列表
并且 (And)    每行格式：序号 + 主题名 + 记录数
并且 (And)    最多显示 5 个，按记录数降序
```

### 场景 2.4: 保留现有趋势图
```
假设 (Given)  统计页
当   (When)   用户向下滚动
那么 (Then)   极性分布 + Top Clusters 之后，保留现有的录音趋势和待办趋势图
并且 (And)    标题改为"统计概览"更名为"认知统计"
```

### 接口约定
```typescript
// GET /api/v1/cognitive/stats 已返回 polarity_distribution
// 需确认返回 top_clusters 数据（或从 cognitive_snapshot.clusters 读取）
```

---

## 场景组 3: 子任务前端 UI（todo-subtask-ui）

> 对标设计图 10-todo-detail-sheet.png
> 文件：`features/todos/components/todo-detail-sheet.tsx`

### 场景 3.1: Detail Sheet 显示子任务列表
```
假设 (Given)  用户点击某个父级待办打开 Detail Sheet
当   (When)   该待办有子任务（subtask_count > 0）
那么 (Then)   Sheet 中间区域显示"Sub-tasks"标题 + 子任务列表
并且 (And)    每个子任务有 checkbox + 文字，可点击切换完成状态
并且 (And)    标题右侧显示"+"按钮用于添加子任务
```

### 场景 3.2: 添加子任务
```
假设 (Given)  Detail Sheet 已打开
当   (When)   用户点击子任务区域的"+"按钮
那么 (Then)   列表底部出现文本输入框，聚焦
并且 (And)    用户输入文字后按回车，创建子任务（POST /api/v1/todos，body 含 parent_id）
```

### 场景 3.3: 待办列表显示子任务计数
```
假设 (Given)  待办列表中某个 todo 有子任务
当   (When)   渲染 TodoRow
那么 (Then)   todo 文字右侧显示 "2/5" 格式的子任务进度（done/total）
```

### 接口约定
```typescript
// 后端已实现：
// GET /api/v1/todos/:id/subtasks
// POST /api/v1/todos { parent_id: string }
// todo 查询已返回 subtask_count, subtask_done_count
```

---

## 场景组 4: 发现页 AI 洞察（discovery-insights）

> 对标设计图 13-discovery-page.png
> 文件：`features/workspace/components/discovery-overlay.tsx`

### 场景 4.1: "路路的发现"区域
```
假设 (Given)  用户有足够数据（batch-analyze 已运行）
当   (When)   打开发现页
那么 (Then)   主题卡片列表下方显示"路路的发现"区域标题
并且 (And)    显示 AI 趋势洞察卡片（左侧竖线 + "趋势 · 85%" + 洞察文字 + "详细 →" 链接）
```

### 场景 4.2: 无洞察时隐藏
```
假设 (Given)  batch-analyze 未生成 patterns 或 contradictions
当   (When)   打开发现页
那么 (Then)   不显示"路路的发现"区域
```

### 接口约定
```typescript
// 数据源：cognitive_snapshot.patterns + cognitive_snapshot.contradictions
// 需新增 API 或复用 /api/v1/cognitive/stats 返回 patterns 数据
```

---

## 场景组 5: 聚类 prompt 调优（cluster-prompt-tuning）

> 影响：发现页主题卡片 + 侧边栏"我的方向"区域
> 文件：`gateway/src/cognitive/batch-analyze-prompt.ts`

### 场景 5.1: batch-analyze 输出 new_clusters
```
假设 (Given)  用户有 50+ 条 strike，涵盖 3 个以上主题方向
当   (When)   运行 batch-analyze
那么 (Then)   AI 输出 new_clusters 数组，至少包含 2-3 个聚类
并且 (And)    每个 cluster 有 name、description、member_strike_ids、polarity
```

### 场景 5.2: 侧边栏显示活跃方向
```
假设 (Given)  batch-analyze 已生成 clusters
当   (When)   打开侧边栏
那么 (Then)   "我的方向"区域显示活跃主题（TreePine 图标 + 名称 + 记录数）
```

### 场景 5.3: 发现页显示认知地图
```
假设 (Given)  有 clusters 数据
当   (When)   打开发现页
那么 (Then)   显示 2 列主题卡片网格（标题 + 记录数 + 色点 + 关键词）
```

### 调优方向
```
batch-analyze-prompt.ts 的 SYSTEM_PROMPT 中需要：
1. 强调"必须输出 new_clusters"，即使只有少量 strike
2. 降低聚类门槛（3 个相关 strike 即可成簇）
3. 给出聚类示例，引导 AI 输出正确格式
```

---

## 场景组 6: 日期格式对齐（date-format-alignment）

> 对标设计图 01-journal-view.png
> 文件：`features/notes/components/notes-timeline.tsx`

### 场景 6.1: 今天的日期显示
```
假设 (Given)  日记时间线中有今天的记录
当   (When)   渲染日期 header
那么 (Then)   显示"今天 · 3月28日"格式（相对日期 + 中文月日）
并且 (And)    不显示大号日期数字
```

### 场景 6.2: 昨天/前天的日期显示
```
假设 (Given)  日记中有昨天的记录
当   (When)   渲染日期 header
那么 (Then)   显示"昨天 · 3月27日"
```

### 场景 6.3: 更早日期的显示
```
假设 (Given)  日记中有 3 天前及更早的记录
当   (When)   渲染日期 header
那么 (Then)   显示"3月25日 周二"格式（中文月日 + 星期）
```

---

## 场景组 7: 登录注册输入框样式（auth-input-style）

> 对标设计图 19-login.png / 20-register.png
> 文件：`features/auth/components/login-page.tsx`, `register-page.tsx`

### 场景 7.1: 输入框改为下划线式
```
假设 (Given)  登录页或注册页
当   (When)   渲染输入框
那么 (Then)   输入框无背景色、无圆角，只有底部边框线
并且 (And)    聚焦时底部边框变为 deer 色
并且 (And)    placeholder 左对齐，无内边距
```

### CSS 变更
```
当前: rounded-xl bg-surface-lowest px-4 focus:ring-2 focus:ring-deer/30
目标: bg-transparent border-b border-muted-accessible/30 rounded-none px-0 focus:border-deer
```

---

## 场景组 8: 聊天麦克风按钮（chat-mic-button）

> 对标设计图 16-chat-advisor.png
> 文件：`features/chat/components/chat-view.tsx`

### 场景 8.1: 输入栏显示麦克风图标
```
假设 (Given)  聊天页面已打开
当   (When)   查看底部输入栏
那么 (Then)   文本框左侧或右侧（发送按钮旁）有麦克风图标按钮
```

### 场景 8.2: 点击麦克风（MVP）
```
假设 (Given)  聊天页面
当   (When)   用户点击麦克风按钮
那么 (Then)   MVP 阶段：显示 toast "语音输入即将上线"
```

---

## 场景组 9: UI 细节打磨（ui-polish）

> 合并 5 个 P2 小项

### 场景 9.1: 待办空状态隐藏 "0/0"
```
假设 (Given)  待办列表无任何数据（totalToday === 0）
当   (When)   渲染进度区域
那么 (Then)   隐藏 "0/0" 和进度条，只显示空状态引导文字
```

### 场景 9.2: 侧边栏精简
```
假设 (Given)  侧边栏打开
当   (When)   渲染菜单
那么 (Then)   移除"今日简报"入口（合并到"每日回顾"的时段判断逻辑中）
并且 (And)    移除"AI 记忆"入口（仅开发者需要，公测用户不需要）
```

### 场景 9.3: 侧边栏"每日回顾"红点
```
假设 (Given)  今日有新的晨间简报或晚间总结未查看
当   (When)   渲染侧边栏"每日回顾"菜单项
那么 (Then)   菜单项右侧显示红色圆点（6px）
```

### 场景 9.4: Onboarding 进度条
```
假设 (Given)  用户在 Onboarding 问答流程中
当   (When)   显示问题 N/5
那么 (Then)   问题标题上方显示彩色进度条（deer 色填充，灰色底色）
并且 (And)    进度条宽度为 N/5 比例
```

### 场景 9.5: Onboarding "跳过"语义
```
假设 (Given)  用户在某个 Onboarding 问题上
当   (When)   查看跳过选项
那么 (Then)   显示"跳过这个问题"（而非"跳过，直接开始"）
并且 (And)    点击后进入下一个问题，不是跳过全部
```

---

## 边界条件
- [ ] 日记卡片 AI 分析：record 无 strike/todo 时不崩溃
- [ ] 认知统计：无数据时显示空状态（已有进度条引导）
- [ ] 子任务：嵌套深度限制为 1 层（不支持子任务的子任务）
- [ ] 日期格式：跨年时需显示年份
- [ ] 聚类 prompt：AI 返回格式不符时优雅降级

## 依赖
- 场景组 1/2/4 依赖后端 API（部分已有）
- 场景组 3 后端已完成，纯前端
- 场景组 5 纯后端 prompt 调优
- 场景组 6/7/8/9 纯前端

## 备注
- 所有设计图在 `docs/designs/` 目录，编号 01-21
- 场景组 6/7/8/9 工作量小，可 30 分钟内完成
- 场景组 1/3 工作量中等，1-2 小时
- 场景组 2/5 工作量较大，需要半天
