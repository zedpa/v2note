---
id: "079"
title: "空状态引导"
status: completed
domain: design
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 空状态引导

> 状态：✅ 已完成
> 优先级：P1 — 新用户首次体验空白

## 概述
为各功能页面设计空状态展示，当数据为空时引导用户理解功能并开始使用，避免"打开一片空白"的困惑体验。

## 现状问题
1. 待办列表为空 → 显示空白（Action Panel / NowCard 无内容）
2. 目标列表为空 → 显示空白
3. 发现页无 Cluster → 无引导
4. 认知统计无数据 → 图表显示空轴
5. 晨间简报无待办无洞察 → 只有问候语
6. 记忆列表为空 → 无引导

## 场景

### 场景 1: 待办空状态
```
假设 (Given)  用户切换到待办 Tab，todo 列表为空
当   (When)   Tab 渲染完成
那么 (Then)   显示引导卡片，插画 + 文案："长按底部麦克风说一句话，AI 帮你提取待办"
并且 (And)    卡片下方有"试试说一句"按钮，点击触发 FAB 录音
并且 (And)    不显示 NowCard 骨架
```

### 场景 2: Action Panel 空状态
```
假设 (Given)  用户在待办 Tab，NowCard 队列为空
当   (When)   NowCard 区域渲染
那么 (Then)   显示鼓励卡片："今天的事都做完了" 或 "还没有待办，说一句试试"
并且 (And)    根据有无历史 todo 区分措辞（全部完成 vs 从未创建）
```

### 场景 3: 目标空状态
```
假设 (Given)  用户打开目标列表，goal 表为空
当   (When)   目标 overlay 渲染完成
那么 (Then)   显示引导："目标会从你的日常记录中自动涌现"
并且 (And)    下方提示："也可以直接告诉 AI：'我今年最重要的目标是...'"
并且 (And)    提供"和路路聊聊"按钮，点击打开 chat overlay
```

### 场景 4: 日记流空状态
```
假设 (Given)  用户在日记 Tab，record 列表为空（不含欢迎日记）
当   (When)   NotesTimeline 渲染完成
那么 (Then)   不显示空列表
并且 (And)    欢迎日记作为唯一卡片展示（设备注册时自动创建的引导记录）
```

### 场景 5: 认知统计空状态
```
假设 (Given)  用户打开认知统计，Strike 数为 0
当   (When)   StatsDashboard 渲染完成
那么 (Then)   图表区域显示占位插画
并且 (And)    文案："积累 5 条以上记录后，AI 开始分析你的认知模式"
并且 (And)    显示当前记录数进度条（0/5）
```

### 场景 6: 侧边栏方向区空状态
```
假设 (Given)  侧边栏"我的方向"区域无 Topic
当   (When)   侧边栏渲染完成
那么 (Then)   方向区显示占位文案："持续记录后，AI 会发现你的关注方向"
并且 (And)    不显示空列表容器
```

### 场景 7: 晨间简报空状态
```
假设 (Given)  用户触发晨间简报，无待办无洞察无目标
当   (When)   简报 overlay 打开
那么 (Then)   只显示问候卡片 + "今天要做什么？" 引导输入
并且 (And)    不显示空的"今日重点"/"洞察"区域
```

## 边界条件
- [ ] 空状态与加载中状态区分（先 loading skeleton，确认空后再显示引导）
- [ ] 用户创建第一条数据后，空状态立即消失（响应式）
- [ ] 引导按钮的点击应有明确反馈（不是静默失败）
- [ ] 离线时不显示"和 AI 聊聊"类按钮

## 接口约定

无新接口，纯前端展示逻辑。判断标准：
```typescript
// 各 hook 返回的数据长度判断
const isEmpty = data.length === 0 && !isLoading;
// 区分"从未有过"和"全部完成"
const hasHistory = totalCount > 0; // 需部分 API 增加 totalCount 字段
```

## 依赖
- 各数据 hook 需区分 loading / empty / loaded 三态
- 可能需要部分 API 增加 meta 信息（如总记录数）

## 关键文件
- `features/workspace/components/todo-workspace-view.tsx` — 待办空状态
- `features/action-panel/components/now-card.tsx` — NowCard 空状态
- `features/goals/components/goal-list.tsx` — 目标空状态
- `features/notes/components/notes-timeline.tsx` — 日记空状态
- `features/sidebar/components/stats-dashboard.tsx` — 统计空状态
- `features/sidebar/components/sidebar-drawer.tsx` — 方向区空状态
- `features/daily/components/morning-briefing.tsx` — 简报空状态

## 备注
- 空状态措辞要温暖，符合产品"温暖陪伴者"定位，不用"暂无数据"这种冰冷措辞
- 引导动作优先指向 FAB（录音入口），这是产品核心交互
- 设计稿中无专门的空状态设计，需参考品牌调性自行设计
