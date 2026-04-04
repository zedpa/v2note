---
id: "068"
title: "认知快照 — 增量分析基础设施"
status: completed
domain: cognitive
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 认知快照 — 增量分析基础设施

> 状态：✅ completed | 优先级：Phase 0（最高优先，cognitive-engine-v2 前置）
> 完成日期: 2026-03-27 — snapshot.ts + migration 029 已创建
> 依赖：无
> 被依赖：cognitive-engine-v2

## 概述

认知快照是 Tier2 批量分析的核心基础设施。它将用户的全部认知结构（聚类、目标、矛盾、模式）压缩为一个 ≤5K tokens 的 JSON 快照，作为每次增量分析的"已有上下文"传入 AI。

**核心价值**：无论用户积累了 100 条还是 10000 条 Strike，Tier2 的输入大小始终可控。已有结构 ≈ 3-5K tokens + 新增 Strike ≈ 5-30K tokens = 总输入始终 ≤ 35K tokens。

### 数据流

```
首次分析（冷启动）：
  无 snapshot → 取全部 Strike → AI 分析 → 建立 snapshot

增量分析：
  读 snapshot（3-5K tokens）
  + 新 Strike（自 last_analyzed_strike_id 之后）
  → AI 增量分析
  → 更新 snapshot
```

---

## 场景

### 场景 1: Snapshot 表创建

```
假设 (Given)  数据库执行迁移 029_cognitive_snapshot.sql
当   (When)   迁移完成
那么 (Then)   存在 cognitive_snapshot 表，结构如下：
              - user_id: UUID, PRIMARY KEY, FK → user(id)
              - clusters: JSONB NOT NULL DEFAULT '[]'
              - goals: JSONB NOT NULL DEFAULT '[]'
              - contradictions: JSONB NOT NULL DEFAULT '[]'
              - patterns: JSONB NOT NULL DEFAULT '[]'
              - last_analyzed_strike_id: UUID（上次分析到的最后一条 Strike）
              - strike_count: INTEGER DEFAULT 0（已分析的 Strike 总数）
              - version: INTEGER DEFAULT 1（乐观锁版本号）
              - updated_at: TIMESTAMPTZ DEFAULT now()
              - created_at: TIMESTAMPTZ DEFAULT now()
```

### 场景 2: 冷启动 — 首次创建 Snapshot

```
假设 (Given)  用户 cognitive_snapshot 行不存在
当   (When)   Tier2 批量分析完成，产出结构化结果
那么 (Then)   INSERT cognitive_snapshot，填入：
              - clusters: 新发现的聚类列表（id, name, description, size, polarity, level）
              - goals: 涌现的目标列表（id, title, status）
              - contradictions: 矛盾列表
              - patterns: 认知模式列表
              - last_analyzed_strike_id: 本批最后一条 Strike 的 id
              - strike_count: 本批 Strike 数量
              - version: 1
```

### 场景 3: 增量更新 — Tier2 完成后更新 Snapshot

```
假设 (Given)  Tier2 增量分析完成
并且 (And)    AI 输出包含 new_clusters、merge_clusters、goal_suggestions 等
当   (When)   更新 cognitive_snapshot
那么 (Then)   clusters 字段 = 旧聚类列表 + 新聚类 - 被合并的聚类
              （合并时用 new_name 替换旧聚类，size 累加）
并且 (And)    goals 字段 = 旧目标列表 + 新涌现目标
并且 (And)    contradictions 字段 = 旧矛盾 + 新矛盾（去重）
并且 (And)    patterns 字段 = 旧模式 + 新模式（去重）
并且 (And)    last_analyzed_strike_id = 本批最后一条 Strike 的 id
并且 (And)    strike_count += 本批新 Strike 数
并且 (And)    version += 1
```

### 场景 4: 读取 Snapshot 构建 Prompt

```
假设 (Given)  Tier2 触发，需要构建 AI prompt
当   (When)   readSnapshot(userId) 被调用
那么 (Then)   如果 snapshot 存在，返回结构化对象
并且 (And)    如果 snapshot 不存在，返回 null（冷启动模式）
```

### 场景 5: 获取新增 Strike 列表

```
假设 (Given)  snapshot 存在，last_analyzed_strike_id = 'abc-123'
当   (When)   getNewStrikes(userId, lastStrikeId) 被调用
那么 (Then)   查询 strike WHERE user_id = $1 AND created_at > (SELECT created_at FROM strike WHERE id = $2)
              ORDER BY created_at ASC
              LIMIT 300
并且 (And)    返回 Strike 列表（id, nucleus, polarity, tags, source_type, created_at）
```

### 场景 6: Snapshot 大小控制

```
假设 (Given)  用户有 50 个聚类（长期使用后）
当   (When)   更新 snapshot
那么 (Then)   只保留 active 状态的聚类（merged/archived 不入 snapshot）
并且 (And)    每个聚类只保留 id + name + description（≤80字）+ size + polarity + level
并且 (And)    goals 只保留 active/progressing/suggested 状态
并且 (And)    contradictions 只保留最近 20 条
并且 (And)    patterns 只保留 confidence ≥ 0.5 的，最多 20 条
并且 (And)    总 JSON 大小 ≤ 10KB（约 5K tokens）
```

### 场景 7: 判断是否有新 Strike 待分析

```
假设 (Given)  Tier2 触发条件检查
当   (When)   调用 countNewStrikes(userId)
那么 (Then)   查询 SELECT COUNT(*) FROM strike WHERE user_id = $1
              AND created_at > (SELECT created_at FROM strike WHERE id = (SELECT last_analyzed_strike_id FROM cognitive_snapshot WHERE user_id = $1))
并且 (And)    返回待分析的 Strike 数量
并且 (And)    如果 snapshot 不存在，返回用户全部 Strike 数量
```

### 场景 8: 并发写入保护

```
假设 (Given)  两个 Tier2 进程同时完成，都尝试更新 snapshot
当   (When)   UPDATE cognitive_snapshot SET ... WHERE user_id = $1 AND version = $2
那么 (Then)   第一个成功（version 匹配），version += 1
并且 (And)    第二个失败（version 已变化，WHERE 不匹配，affected_rows = 0）
并且 (And)    失败方不覆盖已更新的数据
并且 (And)    失败方日志记录 "[snapshot] Concurrent write detected, skipping"
```

### 场景 9: Snapshot 损坏恢复

```
假设 (Given)  cognitive_snapshot.clusters 字段 JSON 格式损坏
当   (When)   readSnapshot(userId) 解析失败
那么 (Then)   删除该行 snapshot（DELETE WHERE user_id = $1）
并且 (And)    返回 null，触发冷启动模式
并且 (And)    日志记录 "[snapshot] Corrupted, reset to cold-start"
```

---

## 接口约定

### DB 迁移

```sql
-- 029_cognitive_snapshot.sql
CREATE TABLE IF NOT EXISTS cognitive_snapshot (
  user_id               UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  clusters              JSONB NOT NULL DEFAULT '[]',
  goals                 JSONB NOT NULL DEFAULT '[]',
  contradictions        JSONB NOT NULL DEFAULT '[]',
  patterns              JSONB NOT NULL DEFAULT '[]',
  last_analyzed_strike_id UUID,
  strike_count          INTEGER NOT NULL DEFAULT 0,
  version               INTEGER NOT NULL DEFAULT 1,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按 last_analyzed_strike_id 快速查新增 Strike
CREATE INDEX IF NOT EXISTS idx_strike_user_created
  ON strike (user_id, created_at)
  WHERE status = 'active';
```

### TypeScript 接口

```typescript
// gateway/src/db/repositories/snapshot.ts

interface CognitiveSnapshot {
  user_id: string;
  clusters: SnapshotCluster[];
  goals: SnapshotGoal[];
  contradictions: SnapshotContradiction[];
  patterns: SnapshotPattern[];
  last_analyzed_strike_id: string | null;
  strike_count: number;
  version: number;
  updated_at: string;
}

interface SnapshotCluster {
  id: string;
  name: string;
  description: string;
  size: number;
  polarity: string;
  level: number;
}

interface SnapshotGoal {
  id: string;
  title: string;
  status: string;
  cluster_id?: string;
}

interface SnapshotContradiction {
  strike_a_nucleus: string;
  strike_b_nucleus: string;
  description: string;
}

interface SnapshotPattern {
  pattern: string;
  confidence: number;
}

// Repository 接口
export async function findByUser(userId: string): Promise<CognitiveSnapshot | null>;
export async function upsert(userId: string, data: Partial<CognitiveSnapshot>): Promise<void>;
export async function incrementalUpdate(
  userId: string,
  version: number,  // 乐观锁
  changes: {
    addClusters?: SnapshotCluster[];
    removeClusters?: string[];       // by id
    updateClusters?: Partial<SnapshotCluster & { id: string }>[];
    addGoals?: SnapshotGoal[];
    addContradictions?: SnapshotContradiction[];
    addPatterns?: SnapshotPattern[];
    lastStrikeId: string;
    newStrikeCount: number;
  },
): Promise<boolean>;  // false = version conflict
```

---

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `supabase/migrations/029_cognitive_snapshot.sql` | **新建**：snapshot 表 + 索引 |
| `gateway/src/db/repositories/snapshot.ts` | **新建**：snapshot CRUD |
| `gateway/src/db/repositories/index.ts` | **修改**：导出 snapshotRepo |

## 边界条件

- [ ] user_id 不存在时 findByUser 返回 null（不抛错）
- [ ] JSONB 字段超大（>100KB）→ 强制裁剪到限制内
- [ ] last_analyzed_strike_id 指向已删除的 Strike → 用 created_at 时间戳兜底
- [ ] 并发 upsert → version 乐观锁保护
- [ ] 数据库连接失败 → snapshot 读取失败时 Tier2 降级为冷启动

## 验收标准

1. snapshot 表创建成功，JSONB 字段可正常读写
2. 增量更新后 version 递增，并发写入被正确拒绝
3. snapshot 总大小始终 ≤ 10KB（50 聚类 + 20 目标 + 20 矛盾 + 20 模式）
4. 冷启动后首次创建 snapshot 包含完整结构
