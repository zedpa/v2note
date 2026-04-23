---
id: "056"
title: "行动事件追踪 + 反馈回流"
status: completed
domain: cognitive
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 行动事件追踪 + 反馈回流

> 状态：✅ completed | 优先级：Phase 4 | 预计：3-4 天
> 依赖：goal-auto-link

## 概述
完成/跳过/阻力等行动事件需要持久化，形成行为模式数据，回流到认知引擎（晚间回顾 alert）和行动排序。

**当前状态：** `cognitive/swipe-tracker.ts` 已实现基础滑动追踪，但数据未结构化存储，也未回流到 daily-cycle。

## 场景

### 场景 1: 跳过行为持久化
```
假设 (Given)  用户左滑行动 → 选择 "🚧有阻力"
当   (When)   事件提交 POST /api/v1/action-panel/event
那么 (Then)   写入 action_event (todo_id, type='skip', reason='resistance', timestamp)
并且 (And)    todo.skip_count += 1
```

### 场景 2: 完成行为持久化
```
假设 (Given)  用户右滑完成行动
当   (When)   事件提交
那么 (Then)   写入 action_event (type='complete')
并且 (And)    todo.status = 'completed'
并且 (And)    关联 goal 的完成率自动更新
```

### 场景 3: 行为模式分析
```
假设 (Given)  过去 14 天 30 条 action_event
当   (When)   GET /api/v1/action-panel/stats
那么 (Then)   返回：完成率、按目标完成率、跳过原因分布、
      高频跳过类型、完成时间段分布
```

### 场景 4: 跳过回流认知引擎
```
假设 (Given)  某行动被跳过 3+ 次
当   (When)   daily-cycle 执行 alert 生成
那么 (Then)   生成 alert："'审阅小李报告'已 3 次跳过，原因：有阻力"
并且 (And)    alert 进入每日回顾洞察区（认知报告）
```

### 场景 5: 结果追踪提示
```
假设 (Given)  todo 完成已过 7 天 + 关联 goal 仍 active
当   (When)   晚间回顾生成
那么 (Then)   路路提问："'打给张总确认报价'完成一周了，结果怎样？"
并且 (And)    用户回复创建新待办，Digest 自动关联回原 todo 和 goal
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新 migration | action_event 表 (id, todo_id, type, reason, timestamp) |
| 新建 `gateway/src/db/repositories/action-event.ts` | CRUD |
| `gateway/src/cognitive/swipe-tracker.ts` | 重构：写入 action_event 表 |
| `gateway/src/cognitive/alerts.ts` | 修改：加跳过频率 alert |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：跳过回流 |

## 验收标准
跳过 3 次的行动在晚间回顾中被路路提及；行为统计能看到完成率和跳过原因分布。
