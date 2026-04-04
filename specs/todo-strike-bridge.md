---
status: superseded
superseded_by: "todo-system.md"
---

# Todo-Strike 数据桥梁

> 状态：✅ completed | 优先级：Phase 4（地基）| 预计：2-3 天
> 依赖：emergence-chain（level 字段）

## 概述
Todo 和 Goal 当前是独立于认知系统的实体，与 Strike/Bond/Cluster 完全分离。这导致意图→行动链路断裂。本 spec 建立数据桥梁：todo.strike_id 关联源 intend Strike，goal.cluster_id 指向对应 Cluster，创建流程统一为 Digest 产出 intend Strike → 自动投影为 todo/goal。

**当前状态：**
- todo 表有 goal_id（关键词匹配关联），无 strike_id
- goal 表有 parent_id（层级），无 cluster_id
- Digest 产出 intend Strike 但不创建 todo
- todo 创建在 process.ts 中，与 Strike 系统断开

## 场景

### 场景 1: intend Strike 自动投影为 todo
```
假设 (Given)  Digest L1 产出 Strike(polarity='intend', granularity='action')
当   (When)   Strike 写入数据库
那么 (Then)   自动创建 todo（strike_id 指向该 Strike）
并且 (And)    todo 继承 Strike 的上下文：时间、人物、优先级从 nucleus 提取
并且 (And)    时间线中该日记卡片底部显示"📌 已创建待办"
```

### 场景 2: 已有 todo 回补 Strike 关联
```
假设 (Given)  存量 todo 1000 条，无 strike_id
当   (When)   执行数据迁移
那么 (Then)   对每条 todo 用 embedding 匹配最相关的 intend Strike
并且 (And)    匹配度 > 0.7 的自动关联
并且 (And)    匹配度低的保持 strike_id=null（不强制）
```

### 场景 3: goal 关联 Cluster
```
假设 (Given)  存量 goal 10 条
当   (When)   执行数据迁移
那么 (Then)   对每条 goal 用 embedding 匹配最相关的 Cluster
并且 (And)    写入 goal.cluster_id
```

### 场景 4: 双向一致性
```
假设 (Given)  todo 被标记完成
当   (When)   状态更新
那么 (Then)   关联的 intend Strike 的 salience 降低
并且 (And)    如果该 Strike 属于某个 goal 的 Cluster，
              goal 的完成率自动更新
```

### 场景 5: Strike 删除保护
```
假设 (Given)  某 intend Strike 有 todo 投影
当   (When)   maintenance 尝试 archive 该 Strike
那么 (Then)   如果关联 todo 仍 active，Strike 不被 archive
并且 (And)    Strike 的 salience 衰减正常进行但不低于 0.1
```

## 数据库变更
- todo 表加 `strike_id UUID REFERENCES strike(id)` (nullable)
- goal 表加 `cluster_id UUID REFERENCES strike(id)` (nullable, 指向 is_cluster=true 的 Strike)

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新 migration | todo.strike_id + goal.cluster_id |
| `gateway/src/db/repositories/todo.ts` | 修改：TodoItem 加 strike_id |
| `gateway/src/db/repositories/goal.ts` | 修改：Goal 加 cluster_id |
| `gateway/src/handlers/digest.ts` | 修改：intend Strike 创建后自动投影 todo |

## AI 调用
- 0 次（纯数据关联逻辑）
- 存量迁移用 embedding 匹配（批量，非实时）

## 验收标准
新创建的 todo 都有 strike_id；目标详情页能从 Cluster 拉到相关日记；todo 完成时 Strike salience 自动降低。
