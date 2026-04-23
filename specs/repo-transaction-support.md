---
id: "repo-transaction-support"
title: "Repo 层事务支持 — 消除 raw SQL 绕过 repo 的技术债"
status: completed
domain: infra
risk: medium
dependencies: ["cognitive-wiki.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Repo 层事务支持 — 消除 raw SQL 绕过 repo 的技术债

## 概述

知识图谱（graphify-out/graph.json）联通性分析发现：`wiki-compiler.ts`、`manage-wiki-page.ts`、`wiki.ts`（routes）三个文件在事务内绕过 repo 层直接使用 `client.query` 执行 raw SQL，导致：

1. **知识图谱断裂**：模块间依赖无法通过 import 分析识别，8 个关键模块分散在 8 个独立社区
2. **SQL 分散维护**：同一张表的 SQL 分散在 repo + 3 个业务文件中，改 schema 时容易遗漏
3. **逻辑重复**：`INSERT INTO wiki_page`、`INSERT INTO todo` 等操作在 repo 和 wiki-compiler 中各有一份，参数顺序不同
4. **测试困难**：事务内的 raw SQL 无法通过 mock repo 来测试，只能 mock `client.query` 的 SQL 字符串

**根因**：`pool.ts` 的 `query()`/`execute()` 函数硬编码使用 `getPool().query()`，不支持传入 `client`。repo 方法基于这些函数构建，无法在事务中使用。

**修复方案**：给 `pool.ts` 的查询函数增加可选 `client` 参数，repo 方法透传该参数。调用方在事务内传入 `client`，事务外走默认 pool。

## 现状量化

### 事务内 raw SQL 清单

**wiki-compiler.ts `executeInstructions()`**（33 处 `client.query`）：

| 操作 | SQL 模式 | 对应 repo 方法 | 出现次数 |
|------|----------|---------------|----------|
| `SELECT 1 FROM wiki_page WHERE id = $1` | 存在性检查 | `wikiPageRepo.findById()` | 7 |
| `UPDATE wiki_page SET content = ...` | 更新 content | `wikiPageRepo.update()` | 2 |
| `INSERT INTO wiki_page (...) VALUES (...)` | 创建 page | `wikiPageRepo.create()` | 3 |
| `UPDATE wiki_page SET status = 'merged'` | 合并 page | `wikiPageRepo.updateStatus()` | 1 |
| `INSERT INTO wiki_page_record (...)` | 关联 record | `wikiPageRecordRepo.link()` | 3 |
| `INSERT INTO wiki_page_record SELECT ...` | 继承关联 | 无（bulk 操作） | 1 |
| `DELETE FROM wiki_page_record WHERE ...` | 删除关联 | `wikiPageRecordRepo.unlink()` 系列 | 1 |
| `UPDATE wiki_page_record SET ...` | 迁移关联 | `wikiPageRecordRepo.transferAll()` | 1 |
| `INSERT INTO todo (...) VALUES (...)` | 创建 goal todo | `todoRepo.create()` | 1 |
| `UPDATE todo SET ...` | 更新 goal | `todoRepo.update()` | 1 |
| `UPDATE todo SET wiki_page_id = ...` | 迁移 goal 关联 | 无（bulk 操作） | 1 |
| `SELECT device_id FROM record ...` | 查 device_id | `recordRepo.findById()` | 1 |
| `SELECT created_by FROM wiki_page ...` | 授权检查 | `wikiPageRepo.findById()` | 2 |
| `INSERT INTO wiki_page_link (...)` | 创建链接 | `wikiPageLinkRepo.createLink()` | 1 |
| `SELECT 1 FROM wiki_page_link ...` | 链接去重 | 无 | 1 |
| `UPDATE record SET compile_status = ...` | 标记已编译 | `recordRepo.updateCompileStatus()` | 1 |

**manage-wiki-page.ts**（goal page 创建，5 处 `client.query`）：

| 操作 | 对应 repo 方法 |
|------|---------------|
| `INSERT INTO wiki_page (...)` | `wikiPageRepo.create()` |
| `INSERT INTO todo (...)` | `todoRepo.create()` |

**wiki.ts routes**（goal page 创建，5 处 `client.query`）：

| 操作 | 对应 repo 方法 |
|------|---------------|
| `INSERT INTO wiki_page (...)` | `wikiPageRepo.create()` |
| `INSERT INTO todo (...)` | `todoRepo.create()` |

### 现有 repo 消费者（正常使用 repo）

| repo | 消费者 |
|------|--------|
| `wikiPageRecordRepo` | at-route-parser, lightweight-classifier, wiki routes, manage-wiki-page, wiki-compiler（仅读） |
| `wikiPageRepo` | lightweight-classifier, wiki routes, manage-wiki-page, wiki-compiler（仅读）, process.ts |
| `todoRepo` | process.ts, todo routes, Agent tools, daily-loop, todo-projector |
| `wikiPageLinkRepo` | wiki routes |

## 1. pool.ts — 增加可选 client 参数

### 场景 1.1: query/queryOne/execute 支持传入 client
```
假设 (Given)  pool.ts 的 query/queryOne/execute 硬编码 getPool().query()
当   (When)   修改函数签名，增加可选的最后一个参数 client
那么 (Then)   签名变为 query<T>(语句, 参数?, client?)
并且 (And)    有 client 时用 client.query(语句, 参数)
并且 (And)    无 client 时用 getPool().query(语句, 参数)（原有行为不变）
```

### 场景 1.2: 类型定义
```
假设 (Given)  pg.PoolClient 和 pg.Pool 都有 query 方法
当   (When)   定义 client 参数类型
那么 (Then)   类型为 pg.PoolClient | undefined
并且 (And)    导出 Queryable 类型别名供 repo 使用：
             type Queryable = pg.PoolClient | undefined
```

## 2. repo 方法 — 透传 client 参数

### 场景 2.1: wikiPageRepo.create 支持 client
```
假设 (Given)  wikiPageRepo.create(fields) 使用 queryOne(sql, params)
当   (When)   改造为 create(fields, client?)
那么 (Then)   内部改为 queryOne(语句, 参数, client)
并且 (And)    无 client 时行为与之前完全一致
```

### 场景 2.2: 需要改造的 repo 方法清单
```
假设 (Given)  已定义 client 注入模式
当   (When)   列出需要改造的 repo 方法
那么 (Then)   按 wiki-compiler 中的使用频率排序改造：

改造优先级：按 wiki-compiler 中的使用频率排序

wikiPageRepo:
  - create(fields, client?)        — wiki-compiler L527/591/695, manage-wiki-page L83, wiki.ts L243
  - update(id, fields, client?)    — wiki-compiler L505/585
  - updateStatus(id, status, client?) — wiki-compiler L650
  - findById(id, client?)          — wiki-compiler 存在性检查 x7（可用于替代 SELECT 1）

wikiPageRecordRepo:
  - link(pageId, recordId, client?) — wiki-compiler L511/544
  - transferAll(src, tgt, client?)  — wiki-compiler L660（语义不完全匹配，需调整）

todoRepo:
  - create(fields, client?)        — wiki-compiler L712, manage-wiki-page L90, wiki.ts L250
  - update(id, fields, client?)    — wiki-compiler L738

wikiPageLinkRepo:
  - createLink(fields, client?)    — wiki-compiler L766

recordRepo:
  - updateCompileStatus(id, status, client?) — wiki-compiler L777
```

### 场景 2.3: 保持向后兼容
```
假设 (Given)  现有消费者调用 wikiPageRepo.create(fields) 不传 client
当   (When)   改造后函数签名变为 create(fields, client?)
那么 (Then)   不传 client 时走 getPool()（原有行为）
并且 (And)    所有现有调用方无需修改
并且 (And)    新的事务场景传入 client 即可
```

## 3. wiki-compiler.ts — 用 repo 替换 raw SQL

### 场景 3.1: update_pages 改造
```
假设 (Given)  wiki-compiler L505: client.query(UPDATE wiki_page SET content=...)
当   (When)   替换为 repo 调用
那么 (Then)   改为 wikiPageRepo.update(upd.page_id, { content: ..., summary: ... }, client)
并且 (And)    L511: client.query(INSERT INTO wiki_page_record...) 改为 wikiPageRecordRepo.link(pageId, recId, client)
```

### 场景 3.2: create_pages 改造
```
假设 (Given)  wiki-compiler L527: client.query(INSERT INTO wiki_page...)
当   (When)   替换为 repo 调用
那么 (Then)   改为 wikiPageRepo.create({ ... }, client)
并且 (And)    L544: INSERT INTO wiki_page_record 改为 wikiPageRecordRepo.link(...)
```

### 场景 3.3: split_page 改造
```
假设 (Given)  wiki-compiler L591: INSERT INTO wiki_page（创建子 page）
并且 (And)    L592-594 内联 SELECT GREATEST(level-1, 1) 计算子 page level
当   (When)   替换为 repo 调用
那么 (Then)   先 wikiPageRepo.findById(sp.source_id, client) 取 parent page 的 level
并且 (And)    JS 端计算 childLevel = Math.max(parentPage.level - 1, 1)
并且 (And)    wikiPageRepo.create({ ..., parent_id: sp.source_id, level: childLevel }, client)
并且 (And)    L609-610 的 INSERT SELECT（继承关联）→ 新增 wikiPageRecordRepo.inheritAll(sourcePageId, childPageId, client?)
```

### 场景 3.4: merge_pages 改造
```
假设 (Given)  wiki-compiler L649-665: 合并逻辑（标记 merged + 迁移关联 + 迁移 goal）
当   (When)   替换为 repo 调用
那么 (Then)   L650: wikiPageRepo.update(mp.source_id, { status: 'merged', merged_into: mp.target_id }, client)
并且 (And)    L655-660: wiki-compiler 的 merge 逻辑是 DELETE 重复 + UPDATE 迁移（两步）
             repo 的 transferAll 是 DELETE + INSERT CTE（一步）
             语义等价，改用 wikiPageRecordRepo.transferAll(source, target, client)
并且 (And)    L665: UPDATE todo SET wiki_page_id → 新增 todoRepo.transferWikiPageRef(fromPageId, toPageId, client?)
```

### 场景 3.5: goal_sync 改造
```
假设 (Given)  wiki-compiler L695/712: INSERT INTO wiki_page + INSERT INTO todo
当   (When)   替换为 repo 调用
那么 (Then)   wikiPageRepo.create({ ..., page_type: 'goal' }, client) + todoRepo.create({ ... }, client)
```

### 场景 3.6: 存在性检查优化
```
假设 (Given)  wiki-compiler 中 7 处 SELECT 1 FROM wiki_page WHERE id = $1
当   (When)   替换为 repo 调用
那么 (Then)   新增 wikiPageRepo.exists(id, client?): Promise<boolean>
并且 (And)    内部 SELECT 1 FROM wiki_page WHERE id = $1，返回 boolean
```

## 4. manage-wiki-page.ts / wiki.ts — 同步改造

### 场景 4.1: goal page + goal todo 事务创建
```
假设 (Given)  manage-wiki-page.ts L78-106: 事务内 raw SQL 创建 goal page + todo
并且 (And)    wiki.ts L238-262: 完全相同的逻辑
当   (When)   替换为 repo 调用
那么 (Then)   wikiPageRepo.create({ page_type: 'goal', ... }, client) + todoRepo.create({ level: 1, ... }, client)
并且 (And)    两处逻辑完全重复 → 提取为共享函数 createGoalPageWithTodo(userId, title, parentId, client)
```

## 5. 新增 repo 方法

### 需要新增的方法

| repo | 方法 | 用途 |
|------|------|------|
| `wikiPageRepo` | `exists(id, client?): Promise<boolean>` | 替代 7 处 `SELECT 1` 存在性检查 |
| `wikiPageRepo` | `update(id, fields, client?)` | 现有方法加 client 参数 |
| `wikiPageRecordRepo` | `inheritAll(sourcePageId, newPageId, client?)` | split_page 时子 page 继承关联 |
| `todoRepo` | `transferWikiPageRef(fromPageId, toPageId, client?)` | merge_pages 时迁移 goal 的 wiki_page_id |

## 验收行为（E2E 锚点）

> 本 spec 是纯重构，不改变任何外部行为。验收标准是全量测试通过 + 知识图谱联通性改善。

### 行为 1: wiki-compiler 编译结果不变
1. 运行全量 wiki-compiler 单元测试
2. 全部通过，编译结果与改造前完全一致

### 行为 2: goal page 创建不变
1. 通过 Agent tool 创建 goal page
2. wiki_page + todo 均正确创建
3. 通过侧边栏创建 goal page，同上

### 行为 3: 知识图谱联通性改善
1. 重新运行 graphify
2. wiki-compiler.ts → todo.ts: 有 imports_from 边
3. wiki-compiler.ts → wiki-page-record.ts: 有 imports_from 边（写入路径）
4. wiki-compiler.ts → wiki-page.ts: 有 imports_from 边

## 边界条件
- [ ] client 为 undefined → 走 getPool()，与改造前行为完全一致
- [ ] client 已 release → 调用会抛错，与直接用 client.query 时行为一致
- [ ] 事务 ROLLBACK → client 上的所有操作自动回滚，与 raw SQL 行为一致
- [ ] pool.ts 的 query/queryOne/execute 增加参数后，现有所有调用方无需修改（参数可选）
- [ ] wikiPageRepo.create 的 RETURNING * → 改造后仍返回完整 WikiPage 对象

## 接口约定

### pool.ts 改造
```typescript
import type pg from "pg";

export type Queryable = pg.PoolClient | undefined;

export async function query<T>(sql: string, params?: any[], client?: Queryable): Promise<T[]> {
  const executor = client ?? getPool();
  const { rows } = await executor.query<T>(sql, params);
  return rows;
}

export async function queryOne<T>(sql: string, params?: any[], client?: Queryable): Promise<T | null> {
  const rows = await query<T>(sql, params, client);
  return rows[0] ?? null;
}

export async function execute(sql: string, params?: any[], client?: Queryable): Promise<number> {
  const executor = client ?? getPool();
  const { rowCount } = await executor.query(sql, params);
  return rowCount ?? 0;
}
```

### repo 方法改造示例
```typescript
// wikiPageRecordRepo.link — 改造前
export async function link(wikiPageId: string, recordId: string): Promise<void> {
  await execute(`INSERT INTO wiki_page_record ...`, [wikiPageId, recordId]);
}

// wikiPageRecordRepo.link — 改造后
export async function link(wikiPageId: string, recordId: string, client?: Queryable): Promise<void> {
  await execute(`INSERT INTO wiki_page_record ...`, [wikiPageId, recordId], client);
}
```

### wiki-compiler 使用示例
```typescript
// 改造前
await client.query(
  `INSERT INTO wiki_page_record (wiki_page_id, record_id)
   SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM record WHERE id = $2)
   ON CONFLICT DO NOTHING`,
  [upd.page_id, recId],
);

// 改造后
await wikiPageRecordRepo.link(upd.page_id, recId, client);
```

## 实施阶段

- [x] Phase 1: pool.ts — query/queryOne/execute 增加可选 client 参数 + 导出 Queryable 类型
- [x] Phase 2: repo 方法改造 — 已有方法加 client 参数 + 新增方法（exists、inheritAll、transferWikiPageRef）
- [x] Phase 3: wiki-compiler.ts — executeInstructions 中 raw SQL 替换为 repo 调用（含 split_page 的 level 计算改为 JS 端）
- [x] Phase 4: manage-wiki-page.ts + wiki.ts — goal page 创建改用 repo + 提取共享函数 goal-page-factory.ts
- [x] Phase 5: 单元测试（19 新增 + 433 全量通过）+ 对抗性审查修复（tzNow、ON CONFLICT target）

## 备注
- 本 spec 是纯重构，不改变任何外部行为
- wiki-compiler 的 `BEGIN/COMMIT/ROLLBACK` 事务管理不变，只是事务内的操作从 raw SQL 换为 repo 调用
- `SET LOCAL statement_timeout = 0` 仍然使用 client.query 直接执行（这是会话级设置，不属于 repo 职责）
- 授权检查（`SELECT created_by FROM wiki_page`）可用 `wikiPageRepo.findById(id, client)` 替代，取 `.created_by` 字段
- manage-wiki-page.ts 和 wiki.ts 中重复的 goal page 创建逻辑应提取为 `createGoalPageWithTodo()` 共享函数，放在 repo 层或独立模块
- 预期改造后 wiki-compiler.ts 的 `client.query` 从 33 处减少到约 3 处（BEGIN/COMMIT/ROLLBACK + SET LOCAL）
