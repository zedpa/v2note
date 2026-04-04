---
id: "095"
title: "Record 层级标签 — 从涌现结构反向标注"
status: active
domain: cognitive
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-01
---
# Record 层级标签 — 从涌现结构反向标注

> Status: ✅ completed
> Created: 2026-04-01

## 背景

当前 record 标签来自 digest AI 提取的原子关键词（人名、主题词），例如 `["铝", "成本", "张总"]`。
这些标签是静态的、扁平的，无法反映 record 在认知结构中的位置。

用户需要的是：record 自动标注它所属的 **L1 聚类名、L2 主题名、L3 维度名**，最多 5 个，随涌现动态变化。

## 数据链路

```
record
  → strike (strike.source_id = record.id)
    → L1 cluster (bond: L1 → strike, type='cluster_member')
      → L2 cluster (bond: L2 → L1, type='cluster_member')
        → L3 domain (strike.domain 或 todo.domain)
```

一条 record 可产生多个 strike，每个 strike 可能属于不同 L1，不同 L1 可能属于不同 L2。
标签取**去重后的唯一集合**，按优先级截取前 5 个。

## 标签填充规则

每条 record 最多 **5 个层级标签**，按以下优先级填充：

```
1. 去重收集该 record 所有 strike 关联的 L3 domain（非空、非"其他"）
2. 去重收集所有关联的 L2 cluster 名称
3. 去重收集所有关联的 L1 cluster 名称
4. 合并为候选池，按 L2 > L1 > L3 排序
5. 截取前 5 个
```

**排序逻辑**：L2 最具概括性排最前，L1 次之，L3（维度）最后作为补充分类。

**示例**：

| 关联结构 | 标签结果 |
|----------|----------|
| L2「职业发展」→ L1「技能提升」→ domain「工作」 | `[职业发展, 技能提升, 工作]` (3个) |
| L1-A「阅读」+ L1-B「写作」→ domain「学习」 | `[阅读, 写作, 学习]` (3个，无L2) |
| L2-A + L2-B + L1-C + domain「工作」「生活」「学习」 | `[L2-A, L2-B, L1-C, 工作, 生活]` (截取5个) |
| 无 cluster 关联，domain「工作」 | `[工作]` (1个) |
| 全无关联 | `[]` (空) |

## 存储方案

### 新增字段

`record` 表新增 `hierarchy_tags JSONB DEFAULT '[]'`

```sql
ALTER TABLE record ADD COLUMN IF NOT EXISTS hierarchy_tags JSONB DEFAULT '[]';
```

存储格式：
```json
[
  {"label": "职业发展", "level": 2},
  {"label": "技能提升", "level": 1},
  {"label": "工作", "level": 3}
]
```

### 为什么不复用 record_tag

- `record_tag` 存的是 AI 提取的原子关键词，是内容标签
- 层级标签是结构标签，来源和更新时机完全不同
- 混在一起会导致 tag 表无限膨胀且语义混乱

## 写入时机

### 时机 1: batch-analyze 完成后

strike 被分配到 L1 cluster → 回溯该 strike 的 source_id(record) → 刷新 record.hierarchy_tags

```
batch-analyze 完成
  → 收集本批所有 strike 的 source_id（去重）
  → 对每个 record_id 调用 refreshHierarchyTags(recordId)
```

### 时机 2: emergence 完成后

L1 被吸纳到 L2 / L1 从 L2 释放 / L2 合并 → 涉及的 L1 的所有成员 strike 的 source record 需要刷新

```
emergence 完成
  → 收集所有变动的 L1 cluster id
  → 查这些 L1 的成员 strike 的 source_id（去重）
  → 对每个 record_id 调用 refreshHierarchyTags(recordId)
```

### 时机 3: 不需要 digest 时写入

digest 阶段 strike 刚创建，还未分配到任何 cluster，hierarchy_tags 为空是正常的。
等 batch-analyze 跑完自然会填充。

## 核心函数

### refreshHierarchyTags(recordId: string)

```
1. 查该 record 的所有 strike: 
   SELECT id FROM strike WHERE source_id = $1 AND status = 'active'

2. 查这些 strike 所属的 L1 cluster:
   SELECT DISTINCT s.id, s.nucleus, s.domain
   FROM bond b JOIN strike s ON s.id = b.source_strike_id
   WHERE b.target_strike_id = ANY($strikeIds) 
     AND b.type = 'cluster_member'
     AND s.is_cluster = true AND s.level = 1 AND s.status = 'active'

3. 查这些 L1 所属的 L2 cluster:
   SELECT DISTINCT s.id, s.nucleus, s.domain
   FROM bond b JOIN strike s ON s.id = b.source_strike_id
   WHERE b.target_strike_id = ANY($l1Ids) 
     AND b.type = 'cluster_member'
     AND s.is_cluster = true AND s.level = 2 AND s.status = 'active'

4. 收集 domain（L3）: 
   从 L1/L2 的 domain 字段 + strike 自身的 domain → 去重、排除 NULL/"其他"

5. 构建标签数组（L2名 → L1名 → L3 domain），去重，截取前 5

6. UPDATE record SET hierarchy_tags = $tags WHERE id = $recordId
```

### extractClusterName(nucleus: string): string

从 `[名称] 描述` 格式中提取名称：
```typescript
function extractClusterName(nucleus: string): string {
  const match = nucleus.match(/^\[(.+?)\]/);
  return match ? match[1] : nucleus.slice(0, 10);
}
```

## 前端适配

### API 返回

`GET /api/v1/records` 已返回完整 record 对象，新增的 `hierarchy_tags` 字段自动包含在内。

### 前端展示

`features/notes/hooks/use-notes.ts` line 56 当前：
```typescript
const tags = (r.tags ?? []).map((t: any) => t.name).filter(Boolean);
```

改为优先展示 hierarchy_tags，原子标签作为补充：
```typescript
const hierarchyTags = (r.hierarchy_tags ?? []).map((t: any) => t.label);
const atomTags = (r.tags ?? []).map((t: any) => t.name).filter(Boolean);
// hierarchy_tags 优先，atom tags 补充，总共不超过 5+3=8 个
```

### 标签样式区分

`note-card.tsx` 中层级标签与原子标签使用不同样式：
- L2: 主色实底（如 deer 色）
- L1: 主色描边
- L3: 灰色底
- 原子标签: 保持现有样式不变

## 场景定义

### 场景 1: batch-analyze 后标签生成

```
Given record-A 产生了 strike-1 和 strike-2
And   batch-analyze 将 strike-1 分配到 L1「技能提升」(domain="工作")
And   L1「技能提升」已属于 L2「职业发展」
When  batch-analyze 完成
Then  record-A.hierarchy_tags = [
        {"label":"职业发展","level":2},
        {"label":"技能提升","level":1},
        {"label":"工作","level":3}
      ]
```

### 场景 2: emergence 吸纳后标签更新

```
Given record-A.hierarchy_tags = [{"label":"技能提升","level":1},{"label":"工作","level":3}]
And   L1「技能提升」原为自由状态
When  emergence 将 L1「技能提升」吸纳进 L2「职业发展」
Then  record-A.hierarchy_tags 更新为 [
        {"label":"职业发展","level":2},
        {"label":"技能提升","level":1},
        {"label":"工作","level":3}
      ]
```

### 场景 3: emergence 释放后标签更新

```
Given record-A.hierarchy_tags 包含 L2「职业发展」和 L1「技能提升」
When  emergence 将 L1「技能提升」从 L2「职业发展」中释放
Then  record-A.hierarchy_tags 移除「职业发展」，保留 [
        {"label":"技能提升","level":1},
        {"label":"工作","level":3}
      ]
```

### 场景 4: 一条 record 跨多个 cluster

```
Given record-B 产生 strike-1(→L1-A) 和 strike-2(→L1-B)
And   L1-A 属于 L2-X，L1-B 自由
And   L1-A.domain="工作"，L1-B.domain="学习"
When  refreshHierarchyTags(record-B)
Then  hierarchy_tags = [
        {"label":"L2-X名","level":2},
        {"label":"L1-A名","level":1},
        {"label":"L1-B名","level":1},
        {"label":"工作","level":3},
        {"label":"学习","level":3}
      ] (恰好5个)
```

### 场景 5: 超过 5 个截断

```
Given record-C 关联到 2个L2 + 2个L1 + 3个L3
When  refreshHierarchyTags(record-C)
Then  按 L2 > L1 > L3 排序后截取前5: [L2-a, L2-b, L1-a, L1-b, L3-a]
And   L3-b 和 L3-c 被截断
```

### 场景 6: 无 cluster 关联

```
Given record-D 的所有 strike 均未被任何 cluster 收纳
And   strike-1.domain = "工作"
When  refreshHierarchyTags(record-D)
Then  hierarchy_tags = [{"label":"工作","level":3}]
```

### 场景 7: 全无关联

```
Given record-E 的 strike 无 cluster、无 domain
When  refreshHierarchyTags(record-E)
Then  hierarchy_tags = []
```

## 边界条件

1. **record 无 strike**: digest 未完成或失败 → hierarchy_tags 保持 `[]`
2. **strike 无 source_id**: 手动创建的 strike 不影响任何 record
3. **cluster status='merged'**: 已合并的 cluster 不出现在标签中（查询过滤 status='active'）
4. **并发安全**: refreshHierarchyTags 是幂等的，重复调用不会产生副作用
5. **标签去重**: 同名标签只保留一个（按 level 取最高）
6. **cluster 名称变更**: 用户编辑 cluster 名称后，需要刷新相关 record 的标签

## 不改动

- `record_tag` / `tag` 表 — 原子标签系统保持不变
- `strike_tag` 表 — strike 级标签保持不变
- `digest.ts` — digest 阶段不写 hierarchy_tags
- `digest-prompt.ts` — AI prompt 不变
- `batch-analyze-prompt.ts` — AI prompt 不变

## 文件清单

| 文件 | 改动 |
|------|------|
| `supabase/migrations/046_record_hierarchy_tags.sql` | 新增 hierarchy_tags 字段 |
| `gateway/src/db/repositories/record.ts` | Record 接口加 hierarchy_tags；新增 updateHierarchyTags 方法 |
| `gateway/src/cognitive/tag-projector.ts` | **新文件**: refreshHierarchyTags + batchRefreshByStrikeIds |
| `gateway/src/cognitive/batch-analyze.ts` | 完成后调用 batchRefreshByStrikeIds |
| `gateway/src/cognitive/emergence.ts` | 各阶段完成后调用 batchRefreshByStrikeIds |
| `features/notes/hooks/use-notes.ts` | 读取 hierarchy_tags 字段 |
| `features/notes/components/note-card.tsx` | 层级标签渲染（区分样式） |
