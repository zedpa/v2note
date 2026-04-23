---
id: "075"
title: "发现页"
status: draft
domain: ui
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 发现页

> 状态：✅ 已完成
> 优先级：P0 — 后端已就绪，前端断路

## 概述
发现页是用户探索自身认知结构的入口。展示从 Strike 中涌现的 Topic（方向/主题），按生命周期阶段组织，让用户看到"我在关注什么"。侧边栏已有入口但 overlay 未实现。

## 前置条件
- `GET /api/v1/topics` 已实现（topics.ts:30）
- `GET /api/v1/topics/:clusterId/lifecycle` 已实现（topics.ts:137）
- `shared/lib/api/topics.ts` 前端 API 客户端已定义（fetchTopics / fetchTopicLifecycle）
- `features/workspace/hooks/use-topics.ts` hook 已存在
- `features/workspace/components/topic-lifecycle-view.tsx` 已存在
- 侧边栏入口已有（sidebar-drawer.tsx 菜单项），onClick 为 TODO

## 场景

### 场景 1: 打开发现页
```
假设 (Given)  用户已登录，有至少 1 个 Cluster
当   (When)   用户点击侧边栏"发现"菜单项
那么 (Then)   打开 discovery overlay（全屏，SwipeBack 右滑返回）
并且 (And)    加载方向列表
并且 (And)    按 stage 分组展示：活跃(active) / 成长(growing) / 种子(seed) / 沉寂(dormant)
```

### 场景 2: 方向卡片展示
```
假设 (Given)  发现页已加载，有 N 个 Topic
当   (When)   页面渲染完成
那么 (Then)   每个方向卡片显示：标签名 + Strike 数量 + 最近活动时间 + 阶段标记
并且 (And)    活跃方向排在最前，沉寂方向灰色降权显示
并且 (And)    卡片支持点击进入方向详情
```

### 场景 3: 方向详情（生命周期视图）
```
假设 (Given)  用户在发现页
当   (When)   用户点击某个方向卡片
那么 (Then)   加载该方向的生命周期数据
并且 (And)    展示该方向的四阶段时间线：现在(Now) / 成长中(Growing) / 种子(Seeds) / 收获(Harvest)
并且 (And)    Now 阶段显示最近相关 Strike 列表
并且 (And)    Growing 阶段显示关联的 Bond 和趋势
并且 (And)    Seeds 阶段显示潜在关联（弱 Bond）
并且 (And)    Harvest 阶段显示已完成的目标/结论
```

### 场景 4: 空状态
```
假设 (Given)  用户刚注册，无 Cluster
当   (When)   用户打开发现页
那么 (Then)   显示引导卡片："继续记录，AI 会帮你发现你在关注什么"
并且 (And)    不显示空列表
```

### 场景 5: 从发现页跳转到相关 overlay
```
假设 (Given)  用户在方向详情页
当   (When)   用户点击某个 Strike / Goal / Todo
那么 (Then)   跳转到对应的 overlay（goal-detail / 日记详情等）
并且 (And)    支持返回到发现页
```

### 场景 6: 筛选药丸
```
假设 (Given)  发现页有多个方向
当   (When)   用户点击顶部筛选药丸（全部/活跃/成长/种子/沉寂）
那么 (Then)   列表过滤为对应阶段的方向
并且 (And)    药丸选中态高亮
并且 (And)    筛选状态存入 localStorage 持久化
```

## 边界条件
- [ ] Topic 列表为空（新用户）
- [ ] 只有 1 个 Cluster 的极简场景
- [ ] Cluster 下无 Strike（数据异常兜底）
- [ ] 网络断开时显示缓存或离线提示

## 接口约定

已有接口，无需新建：

```typescript
// GET /api/v1/topics
interface Topic {
  clusterId: string;
  label: string;
  stage: "active" | "growing" | "seed" | "dormant";
  strikeCount: number;
  lastActivity: string;  // ISO datetime
  goalCount: number;
}

// GET /api/v1/topics/:clusterId/lifecycle
interface TopicLifecycle {
  now: Strike[];
  growing: { bonds: Bond[]; trend: "up" | "stable" | "down" };
  seeds: Strike[];
  harvest: Goal[];
}
```

## 依赖
- `GET /api/v1/topics` — ✅ 已实现
- `GET /api/v1/topics/:clusterId/lifecycle` — ✅ 已实现
- `shared/lib/api/topics.ts` — ✅ 已定义
- topic-lifecycle spec — 后端已完成 11/12 场景
- Cluster 数据 — 需 Tier2 batch-analyze 产出

## 关键文件
- `features/sidebar/components/sidebar-drawer.tsx` — 入口（需接线 openOverlay("discovery")）
- `features/workspace/components/topic-lifecycle-view.tsx` — 已有生命周期视图
- `features/workspace/hooks/use-topics.ts` — 已有 hook
- `app/page.tsx` — 需新增 "discovery" overlay 分支

## 备注
- 发现页是"结构涌现"原则的核心体现——用户不手动分类，AI 从 Strike 密度中自然长出方向
- 本 spec 仅覆盖前端 overlay 实现，后端已由 topic-lifecycle spec 覆盖
- 设计稿参考：`docs/designs/13-discovery-page.png`
