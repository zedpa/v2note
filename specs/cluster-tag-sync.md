# Cluster 标签反写日记

> 状态：✅ 已完成（集成到batch-analyze）| 优先级：Phase 1
> 2026-03-29 修复：cluster_tags → strike_tag（已有）+ cluster名称 → record_tag 传播（新增）

## 概述
Process 的 tags 是硬编码匹配，Digest 的 Cluster 是语义聚类。两套标签不一致，用户在时间线看到的标签和地图上的节点对不上。方案：Cluster 名成为用户可见的标签体系，通过 strike_tag → strike → record 链路反推，不在 record 表加冗余字段。

## 场景

### 场景 1: Cluster 涌现后反写 strike_tag
```
假设 (Given)  daily-cycle 完成聚类，产生 "供应链管理" Cluster
并且 (And)    该 Cluster 包含 8 个 Strike，来自 5 条不同日记
当   (When)   tag-sync 阶段执行
那么 (Then)   这 8 个 Strike 的 strike_tag 新增 label="供应链管理"
并且 (And)    created_by = 'cluster'
并且 (And)    confidence = bond 强度均值
```

### 场景 2: 前端通过 strike_tag 聚合展示日记标签
```
假设 (Given)  日记 A 的 3 个 Strike 分布在 "供应链管理" 和 "产品规划" 两个 Cluster
当   (When)   渲染时间线日记卡片
那么 (Then)   底部显示最多 2 个标签（按关联 Strike 数排序）
并且 (And)    标签名 = Cluster 名称
并且 (And)    时间线左栏结构导航中，该日记在两个主题下均可见
```

### 场景 3: Cluster 合并后标签更新
```
假设 (Given)  "供应链管理" 和 "供应商评估" 合并为 "供应链决策"
当   (When)   tag-sync 执行
那么 (Then)   旧标签 "供应链管理" 和 "供应商评估" 被替换为 "供应链决策"
并且 (And)    strike_tag 中旧记录标记 confidence=0（软删除）
并且 (And)    新记录 label="供应链决策", created_by='cluster'
```

### 场景 4: Cluster 消退后清理标签
```
假设 (Given)  Cluster "临时讨论" 因成员过少被 maintenance 归档
当   (When)   tag-sync 执行
那么 (Then)   关联 Strike 的该标签 confidence 设为 0
并且 (And)    日记本身不受影响（不删除、不修改 content）
并且 (And)    时间线左栏中该主题节点消失
```

### 场景 5: 用户手动标签优先级高于 Cluster 标签
```
假设 (Given)  用户手动给日记打了 #供应链 标签（created_by='user'）
并且 (And)    Cluster 涌现出 "供应链管理" 标签（created_by='cluster'）
当   (When)   展示标签
那么 (Then)   用户标签排在前面
并且 (And)    如果语义重叠（如 "供应链" ≈ "供应链管理"），只显示用户的版本
```

## 边界条件
- [ ] Cluster 命名变更（AI 重命名）：tag-sync 应检测并更新
- [ ] 同一 Strike 属于 3+ 个 Cluster：标签最多显示 2 个
- [ ] 空 Cluster（成员为 0）：不应产生标签

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/tag-sync.ts` | Cluster→strike_tag 同步逻辑 |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：在 maintenance 后加 tag-sync 步骤 |
| `gateway/src/db/repositories/strike-tag.ts` 或 strikeTagRepo | 确认批量更新能力 |
| 前端时间线组件 | 修改：标签渲染从 strike_tag 聚合 |

## 数据库变更
- strike_tag.created_by 新增值 'cluster'（原有 'digest'|'user'）
- 无新表

## AI 调用
0 次（纯数据同步）

## 验收标准
时间线日记卡片底部标签 = 地图上的 Cluster 节点名称。用户手动标签不被覆盖。
