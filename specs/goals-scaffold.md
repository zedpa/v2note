---
id: "086"
title: "目标场景前端骨架"
status: completed
domain: goal
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 目标场景前端骨架

> 状态：✅ 列表+详情+子任务计数完成 | 优先级：Phase 4
> 2026-03-29: findActiveGoalsByUser/Device 加入 subtask_count/subtask_done_count
> 深入讨论按钮待后续 advisor 模式完善后接入
> 说明：后端 goal 表 + CRUD API 已存在，但 features/goals/ 目录不存在。此 spec 补全前端。

## 概述
`gateway/src/routes/goals.ts` 和 `goalRepo` 已提供完整 CRUD。goal 表有 parent_id 支持层级。但前端没有 `features/goals/` 模块，目标管理 UI 完全缺失。这是 P1-1/P1-2 的前置。

## 场景

### 场景 1: 目标列表页
```
假设 (Given)  用户有 3 个 active 目标，1 个 suggested 目标
当   (When)   进入目标场景 /goals
那么 (Then)   显示三层嵌套结构：项目卡片 > 目标卡片 > 行动项
并且 (And)    suggested 目标在底部"未归属"区域，带"新"标记
并且 (And)    每个目标卡片显示：名称 + 关联日记数 + 待办完成率
```

### 场景 2: 目标详情面板
```
假设 (Given)  用户点击目标 "评估供应商"
当   (When)   右侧详情面板展开（360px）
那么 (Then)   显示：
      - 健康度四维条（方向/资源/路径/驱动）
      - 相关日记列表（可展开）
      - 关联待办列表（可勾选完成）
      - "深入讨论"按钮（触发参谋对话）
```

### 场景 3: 手动创建目标
```
假设 (Given)  用户点击"+"按钮
当   (When)   输入目标名称 "Q2供应链重建"
那么 (Then)   创建并保存新目标
并且 (And)    可选择父目标（项目归属）
并且 (And)    创建后立即触发 goal-auto-link 扫描
```

### 场景 4: 确认/删除 suggested 目标
```
假设 (Given)  涌现引擎产出 suggested 目标
当   (When)   用户点击"确认"
那么 (Then)   status 从 'suggested' → 'active'
当   (When)   用户点击"忽略"
那么 (Then)   status → 'dismissed'，从列表移除
```

### 场景 5: 目标归档
```
假设 (Given)  用户认为目标已完成或放弃
当   (When)   长按目标 → 选择"归档"
那么 (Then)   status → 'archived'
并且 (And)    从活跃列表移除，可在"已归档"中查看
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `features/goals/` | 目标模块：components + hooks |
| 新建 `features/goals/components/goal-list.tsx` | 目标列表 |
| 新建 `features/goals/components/goal-detail.tsx` | 目标详情面板 |
| 新建 `features/goals/hooks/use-goals.ts` | 数据加载 + CRUD |
| `app/goals/page.tsx` | PC 端目标页面路由 |

## 验收标准
能看到目标列表、创建目标、查看详情、确认 suggested、归档。为 P1-1 提供 UI 骨架。
