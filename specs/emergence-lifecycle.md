---
id: "078"
title: "Emergence Lifecycle — L2 涌现全生命周期"
status: active
domain: cognitive
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-01
---
# Emergence Lifecycle — L2 涌现全生命周期

> Status: ✅ completed
> Created: 2026-04-01

## 背景

当前 `emergence.ts` 只处理「自由 L1 → 新建 L2」这一条路径。
L2 一旦创建就是永久的、不可变的——不会吸纳新 L1、不会释放不再相关的 L1、不会被清理。
这导致以下真实场景无法正确处理：

---

## 问题清单

### P1: 新 L1 无法被现有 L2 吸纳

**现状**: emergence 查询排除了已被 L2 吸收的 L1，只在自由 L1 之间比较。
**场景**: 用户持续产出新 L1，其中一些与现有 L2 主题高度相关，但永远不会被收入。
**影响**: L2 内容停滞，新的相关 L1 孤立存在。

### P2: L1 无法从 L2 中释放（语义漂移）

**现状**: cluster_member bond 一旦创建，永不删除/重评估。
**场景**: 用户兴趣转移，L1-A 最初属于 L2「职业发展」，但随着成员 strike 变化，语义已偏移到「创业」方向。L1-A 仍卡在旧 L2 中。
**影响**: L2 内部逐渐失去一致性。

### P3: 空 L2 不会自动清理

**现状**: dissolveCluster 是手动 API，没有自动触发。
**场景**: 用户手动解散了 L2 下的所有 L1（或 L1 被合并到其他 cluster），L2 变成空壳。
**影响**: 侧边栏出现空文件夹，My World 树结构混乱。

### P4: L2 之间不会合并

**现状**: 只有 L1 层有 AI 驱动的 merge_clusters 逻辑（batch-analyze），L2 层没有。
**场景**: 两个 L2「前端技术」和「Web 开发」语义高度重叠，但永远不会被合并。
**影响**: L2 层级冗余膨胀。

### P5: cluster_member bond 不参与衰减

**现状**: maintenance.ts 的 `decayBondStrength` 对所有 bond 统一衰减，但 cluster_member 始终以 strength=1.0 创建。衰减后可能低于阈值被无声忽略，但没有相应的逻辑处理这种状态。
**场景**: 极端情况下 90 天后 cluster_member strength 衰减到 0.49，但查询仍用 `type='cluster_member'` 不检查 strength。
**影响**: 数据不一致——bond 表里的 strength 值失去语义。

### P6: 已合并 cluster 的 bond 残留

**现状**: batch-analyze merge 时，旧 cluster 标记为 status='merged'，但旧的 cluster_member bond 未删除。emergence 通过 EXISTS 子查询检查 L2 归属时，可能匹配到 merged L2 的 bond，导致 L1 被误判为「已被吸收」。
**场景**: L2-X 合并到 L2-Y，L1-A 原属 L2-X。如果 bond (L2-X→L1-A) 残留，L1-A 的 "free" 查询会被 L2-X 的旧 bond 挡住（因为查询只检查 `strike.level=2`，不检查 `strike.status`）。
**影响**: L1 被幽灵 L2 锁住，永远不会再参与涌现。

---

## 场景定义

### 场景 1: 新 L1 吸纳进现有 L2

```
Given 已有 L2「职业发展」包含 L1-A「技能提升」和 L1-B「晋升路径」
When  新产生 L1-C「管理能力」，与 L1-A、L1-B 的平均余弦相似度 >= 0.70
Then  L1-C 通过 cluster_member bond 加入 L2「职业发展」
And   不创建新 L2
And   L2 的 embedding 异步更新（可选：基于成员重新生成）
```

### 场景 2: L1 从 L2 中释放

```
Given L2「职业发展」包含 L1-A、L1-B、L1-C
And   L1-C 的 embedding 与 L2 其余成员的平均相似度 < 0.50
When  emergence 周期运行
Then  L1-C 的 cluster_member bond 被删除
And   L1-C 回归自由状态，可参与后续涌现
And   如果 L2 成员数降至 0，触发自动清理（场景 3）
```

### 场景 3: 空 L2 自动清理

```
Given L2「旧主题」的所有 L1 成员已被释放或合并到其他 cluster
When  emergence 周期运行
Then  L2 的 status 设为 'dissolved'
And   关联的 todo.cluster_id 清空（下移到 L1 或置 NULL）
And   侧边栏不再显示该 L2
```

### 场景 4: L2 之间合并

```
Given L2-X「前端技术」和 L2-Y「Web 开发」的 embedding 相似度 >= 0.80
And   两者的 L1 成员间也有较高交叉相似度
When  emergence 周期运行
Then  AI 判断是否合并，若 merge=true：
  - 创建新 L2-Z
  - L2-X 和 L2-Y 的 L1 成员全部迁移到 L2-Z
  - 旧 L2 标记为 status='merged'
  - todo.cluster_id 从旧 L2 迁移到新 L2
```

### 场景 5: cluster_member bond 免疫衰减

```
Given maintenance.decayBondStrength 被调用
When  处理 cluster_member 类型的 bond
Then  跳过衰减（strength 保持 1.0）
```

### 场景 6: 已合并 L2 的 bond 不阻塞 L1

```
Given L2-X (status='merged') 仍有残留的 cluster_member bond 指向 L1-A
When  emergence 查询自由 L1
Then  L1-A 不被 L2-X 的 bond 阻塞（查询增加 status='active' 条件）
And   L1-A 正常参与涌现
```

---

## 接口约定

### runEmergence(userId) 扩展后的流程

```
1. 吸纳阶段（新增）
   - 查所有 active L2 及其 L1 成员
   - 查所有自由 L1（修正：排除 merged/dissolved L2 的 bond）
   - 对每个自由 L1，计算与各 L2 成员的平均相似度
   - 相似度 >= ABSORB_THRESHOLD(0.70) 的，创建 cluster_member bond 吸纳

2. 释放阶段（新增）
   - 对每个 active L2，检查成员 L1 间的一致性
   - 与其余成员平均相似度 < RELEASE_THRESHOLD(0.50) 的 L1，删除 cluster_member bond

3. 清理阶段（新增）
   - 查所有成员数 == 0 的 active L2，设为 dissolved
   - 清理关联 todo.cluster_id

4. 创建阶段（现有逻辑，不变）
   - 自由 L1 两两相似度 >= 0.75
   - 连通分量 >= 2 个
   - AI 判断 → 创建新 L2

5. 合并阶段（新增）
   - active L2 两两 embedding 相似度 >= L2_MERGE_THRESHOLD(0.80)
   - AI 判断 → 合并

6. Bond 继承（现有逻辑，不变）
```

### EmergenceResult 扩展

```typescript
interface EmergenceResult {
  higherOrderClusters: number;  // 新建的 L2
  bondInheritance: number;      // 继承的 bond
  absorbed: number;             // 新增：吸纳进现有 L2 的 L1 数
  released: number;             // 新增：从 L2 释放的 L1 数
  dissolved: number;            // 新增：清理的空 L2 数
  merged: number;               // 新增：L2 合并数
}
```

---

## 阈值参数

| 参数 | 值 | 说明 |
|------|-----|------|
| ABSORB_THRESHOLD | 0.70 | 自由 L1 与 L2 成员平均相似度，达到则吸纳 |
| RELEASE_THRESHOLD | 0.50 | L1 与同 L2 其余成员的平均相似度，低于则释放 |
| L2_MERGE_THRESHOLD | 0.80 | 两个 L2 的 embedding 相似度，达到则候选合并 |
| MIN_FREE_L1 | 3 | 最少自由 L1 数量才启动创建阶段（不变） |
| MIN_GROUP_SIZE | 2 | 连通分量最小规模（不变） |
| SIMILARITY_THRESHOLD | 0.75 | 自由 L1 间相似度阈值（不变） |

---

## 边界条件

1. **吸纳多选**: 一个自由 L1 可能同时与多个 L2 超过阈值 → 选相似度最高的 L2
2. **释放后立即吸纳**: 同一轮 emergence 中释放的 L1 应参与后续创建阶段
3. **单成员 L2 不立即清理**: 释放后 L2 只剩 1 个 L1 时不清理（保留，等后续吸纳补充）
4. **合并阶段需要 AI 确认**: 不纯靠相似度自动合并，AI 可以拒绝
5. **todo.cluster_id 级联**: L2 dissolved/merged 时，关联 todo 需迁移到新 L2 或置 NULL
6. **embedding 缺失容错**: L1 或 L2 无 embedding 时跳过相似度计算，不报错

---

## 不改动

- batch-analyze.ts 的 L1 创建/合并逻辑
- batch-analyze-prompt.ts 的 AI prompt
- 侧边栏 My World 树的渲染逻辑（只要数据正确，UI 自动适配）
- maintenance.ts 的 salience decay 逻辑
- daily-cycle.ts / proactive engine 的调度频率

---

## 修复项（独立于新流程）

### Fix-1: cluster_member bond 免疫衰减
**文件**: `gateway/src/cognitive/maintenance.ts`
**改动**: `decayBondStrength` SQL 增加 `AND b.type != 'cluster_member'`

### Fix-2: 自由 L1 查询排除 merged/dissolved L2
**文件**: `gateway/src/cognitive/emergence.ts`
**改动**: EXISTS 子查询增加 `AND p.status = 'active'`
