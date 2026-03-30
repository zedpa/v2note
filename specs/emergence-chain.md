# 完整涌现链 L1→L2→L3

> 状态：✅ L1+L2完成，L3通过todo.domain实现 | 优先级：Phase 3
> L1: batch-analyze 产出 L1 cluster (level=1)
> L2: emergence.ts 连通分量 + AI 判断合并 (level=2), 周日运行 + batch新建3+ L1自动触发
> L3: 通过 todo.domain 统一模型实现（不再用 strike level=3）
> 依赖：source-type-weight, top-level-dimensions

## 概述
当前 clustering.ts 产出 L1 Cluster（主题），emergence.ts 在 Cluster 间建 bond 但不做向上聚合。缺少从主题→大主题→领域的层级涌现。这是思维导图视图和结构化输出的基础。

**当前状态：**
- clustering.ts：三角闭合 → L1 Cluster（is_cluster=true），AI 命名
- emergence.ts：跨 Cluster bond、模式提取，但不创建 L2
- 无 level 字段，无 parent_id（Strike 表）

## 场景

### 场景 1: L1 Cluster 正常涌现（已实现，确认行为）
```
假设 (Given)  10+ 条日记产出 30+ 个 Strike
并且 (And)    多个 Strike 之间有高密度 bond（三角闭合度 > 0.3）
当   (When)   daily clustering 运行
那么 (Then)   涌现出 L1 Cluster
并且 (And)    Cluster 记录 level=1
并且 (And)    每个 Cluster 有 AI 生成的名称
```

### 场景 2: L1 向上涌现为 L2
```
假设 (Given)  3 个 L1 Cluster 两两之间都有 bond (strength > 0.6)
并且 (And)    成员 Strike 在语义上指向同一个更高层主题
当   (When)   周涌现引擎运行（emergence.ts 扩展）
那么 (Then)   AI 审核是否属于同一方向
并且 (And)    如果是，创建 L2 Cluster（level=2, is_cluster=true）
并且 (And)    L1 通过 bond.type='cluster_member' 归入 L2
并且 (And)    思维导图中：L2 为父节点，L1 为子节点
```

### 场景 3: L2 关联到顶层维度（L3）
```
假设 (Given)  L2 Cluster "供应链评估" 涌现
并且 (And)    存在预设顶层维度 "工作"（level=3）
当   (When)   涌现引擎判断归属
那么 (Then)   L2 embedding 和 L3 embedding 匹配（余弦相似度 > 0.5）
并且 (And)    L2 关联到 "工作" 顶层
并且 (And)    思维导图：工作 > 供应链评估 > 供应链成本/供应商质量/...
```

### 场景 4: Cluster 间 bond 继承
```
假设 (Given)  L1-A 和 L1-B 属于 L2-X
并且 (And)    L1-C 和 L1-D 属于 L2-Y
并且 (And)    L1-A 和 L1-C 之间有 bond
当   (When)   L2 涌现完成
那么 (Then)   L2-X 和 L2-Y 之间自动建立 bond
并且 (And)    bond strength = 子级 bond 的加权平均
```

### 场景 5: 涌现后历史不丢失
```
假设 (Given)  L1 "供应链成本" 被合并入 L2 "供应链评估"
当   (When)   用户查看历史
那么 (Then)   L1 仍作为 L2 的子节点独立存在
并且 (And)    L1 的所有日记关联不变
并且 (And)    思维导图可展开/折叠每一层
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/cognitive/emergence.ts` | 大幅扩展：L2 涌现逻辑 |
| `gateway/src/cognitive/clustering.ts` | 修改：创建 Cluster 时写入 level=1 |
| migration | strike 表加 level 字段 (INT, 默认 NULL, Cluster 专用 1/2/3) |

## AI 调用
- L2 涌现判断：1 次/周，如果当天有3个以上L1 Cluster 涌现，则直接调用 L2 涌现判断
- L3 归属：0 次（embedding 匹配）

## 验收标准
思维导图能显示 3 层结构；网状图中不同层级节点大小不同。
