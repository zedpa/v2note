---
id: fix-record-delete-ghost
title: "Fix: 日记删除后幽灵 Strike 残留 + 数据未清理"
status: completed
backport: strike-extraction.md
domain: cognitive
risk: medium
dependencies: ["todo-core.md"]
created: 2026-04-10
updated: 2026-04-17
---

# Fix: 日记删除后幽灵 Strike 残留 + 数据未清理

## Bug 现象

1. 用户删除日记后，关联的 Strike 仍然存在（source_id 被置为 NULL 但 status 仍 active）
2. 这些孤儿 Strike 在批处理（batch-analyze）中被当作有效 Strike，生成幽灵 Cluster/Pattern
3. 用户感觉"删除的日记又回来了"——实际是 Strike 衍生的认知数据在各处出现

## 根因

`migration 030_strike_source_cascade.sql` 设置了 `ON DELETE SET NULL`：

```sql
ALTER TABLE strike
  ADD CONSTRAINT strike_source_id_fkey
  FOREIGN KEY (source_id) REFERENCES record(id) ON DELETE SET NULL;
```

删除 record 后，所有关联 strike 的 `source_id` 被置为 NULL，但 strike 本身仍然 active。
后续认知引擎查询 `findActive(userId)` 和 `getNewStrikes()` 不过滤 `source_id IS NULL`，导致孤儿 strike 参与批处理。

## 修复方案

### A. 删除 Record 时级联清理 Strike

在 `recordRepo.deleteByIds()` 执行前，显式删除关联的 strike：

```typescript
// gateway/src/db/repositories/record.ts
export async function deleteByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  // 先删除关联的 strike（级联会清理 bond、strike_tag）
  await execute(`DELETE FROM strike WHERE source_id IN (${placeholders})`, ids);
  return execute(`DELETE FROM record WHERE id IN (${placeholders})`, ids);
}
```

### B. 清理存量孤儿 Strike

添加一次性清理 SQL，处理历史遗留的 `source_id IS NULL` 的孤儿 strike：

```sql
DELETE FROM strike WHERE source_id IS NULL AND is_cluster = false;
```

注意：`is_cluster = true` 的 strike 是由 batch-analyze 创建的聚类，它们的 source_id 本来就是 NULL，不应删除。

## 场景

### 场景 1: 删除日记 → Strike 一并删除

```
假设 (Given)  一条日记关联了 3 条 active Strike
当   (When)   用户删除该日记
那么 (Then)   该日记的 record 被移除
并且 (And)    关联的 3 条 Strike 也被删除
并且 (And)    Strike 关联的 Bond 和 StrikeTag 级联删除
```

### 场景 2: 批量删除 → 所有关联 Strike 清理

```
假设 (Given)  用户选中 5 条日记（共关联 12 条 Strike）
当   (When)   用户执行批量删除
那么 (Then)   5 条 record 和 12 条 Strike 全部删除
```

### 场景 3: 删除后 batch-analyze 不处理幽灵数据

```
假设 (Given)  用户删除了一条日记
当   (When)   下一次 batch-analyze 执行
那么 (Then)   已删除日记的 Strike 不出现在分析输入中
并且 (And)    不会产生新的幽灵 Cluster/Pattern
```

### 场景 4: 聚类 Strike 不受影响

```
假设 (Given)  batch-analyze 生成的 Cluster Strike（is_cluster=true, source_id=NULL）
当   (When)   清理孤儿 Strike
那么 (Then)   聚类 Strike 保留不受影响
```

## 边界条件

- [ ] Strike 的 Bond 有 `ON DELETE CASCADE`，删除 Strike 会自动删除 Bond
- [ ] Strike 的 StrikeTag 有 `ON DELETE CASCADE`，同理自动清理
- [ ] 删除 record 前先删 strike：避免 FK 约束变更对现有数据的影响
- [ ] 并发场景：如果 digest 正在处理的 record 被删除 → claimForDigest 已有原子抢占，不影响

## 影响文件

- `gateway/src/db/repositories/record.ts` — `deleteByIds` 添加 strike 清理

## 验收行为（E2E 锚点）

### 行为 1: 删除日记后 Strike 表无残留
1. 查询某条日记关联的 Strike 数量
2. 删除该日记
3. 再次查询，Strike 数量为 0

### 行为 2: 已有孤儿 Strike 清理
1. 执行清理 SQL
2. 查询 `SELECT count(*) FROM strike WHERE source_id IS NULL AND is_cluster = false` → 0
