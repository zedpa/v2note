---
id: "055"
title: "数据库 Schema 清理 + Embedding 持久化"
status: completed
domain: infra
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 042: 数据库 Schema 清理 + Embedding 持久化

> 状态：✅ 已完成

## 概述

公测前一次性解决 3 个致命问题（embedding 列/表缺失导致语义匹配全部失败）、3 个高风险冗余（废弃表/冗余表未清理）、domain 值不统一、缺失索引，以及 embedding 写入链路缺失。数据库已清空，无需数据迁移。

---

## A 部分：Schema 修复（Migration 042）

### 场景 A1: strike.embedding 列创建
```
假设 (Given)  strike 表无 embedding 列
当   (When)   执行 migration 042
那么 (Then)   strike 表新增 embedding vector(1024) 列
并且 (And)    创建 HNSW 索引 idx_strike_embedding（vector_cosine_ops）
```

### 场景 A2: todo_embedding / goal_embedding 表创建
```
假设 (Given)  数据库中不存在 todo_embedding 和 goal_embedding 表
当   (When)   执行 migration 042
那么 (Then)   创建 todo_embedding(todo_id PK → todo, embedding vector(1024))
并且 (And)    创建 goal_embedding(goal_id PK → todo, embedding vector(1024))
并且 (And)    两表均有 HNSW 索引 + RLS 策略
```

### 场景 A3: device_id 类型修正
```
假设 (Given)  pending_intent.device_id 和 agent_plan.device_id 为 TEXT 类型
当   (When)   执行 migration 042
那么 (Then)   两列类型改为 UUID
并且 (And)    与 device(id) UUID 类型一致
```

### 场景 A4: goal 表替换为 VIEW
```
假设 (Given)  goal 表存在但 goalRepo 已是 todo 适配层
当   (When)   执行 migration 042
那么 (Then)   goal 表被 DROP
并且 (And)    创建同名 VIEW：SELECT ... FROM todo WHERE level >= 1
并且 (And)    todo.goal_id FK 改为指向 todo(id)
并且 (And)    现有 SELECT ... FROM goal 的代码无需修改（VIEW 透明兼容）
```

### 场景 A5: 废弃表删除
```
假设 (Given)  weekly_review、customer_request、setting_change 表存在但无活跃代码写入
当   (When)   执行 migration 042
那么 (Then)   三表被 DROP（CASCADE）
```

### 场景 A6: domain CHECK 约束
```
假设 (Given)  todo/strike/record 的 domain 列为自由 TEXT
当   (When)   执行 migration 042
那么 (Then)   todo.domain 默认值改为 '工作'
并且 (And)    todo/strike/record 的 domain 添加 CHECK 约束
             允许 NULL 或 IN ('工作','学习','创业','家庭','健康','生活','社交')
并且 (And)    INSERT domain='invalid' 时 DB 报错
```

### 场景 A7: 复合索引补全
```
假设 (Given)  缺少 batch-analyze / todo 列表高频查询的复合索引
当   (When)   执行 migration 042
那么 (Then)   创建 idx_strike_user_created(user_id, created_at DESC)
并且 (And)    创建 idx_todo_user_done_level(user_id, done, level)
并且 (And)    创建 idx_todo_device_done_level(device_id, done, level)
```

---

## B 部分：Embedding 持久化链路

### 场景 B1: Strike 创建时写入 embedding
```
假设 (Given)  digest 流程通过 strikeRepo.create() 创建了新 Strike
当   (When)   Strike 成功写入数据库后
那么 (Then)   异步调用 getEmbedding(nucleus) 获取 1024 维向量
并且 (And)    UPDATE strike SET embedding = $1 WHERE id = $2
并且 (And)    embedding 写入失败不影响主流程（catch 记录日志，继续执行）
```

### 场景 B2: Cluster 创建时写入 embedding
```
假设 (Given)  batch-analyze / emergence / top-level 创建 cluster Strike
当   (When)   is_cluster=true 的 Strike 写入后
那么 (Then)   同样异步写入 embedding（与 B1 共用逻辑）
```

### 场景 B3: Todo 创建时写入 todo_embedding
```
假设 (Given)  todo-projector / create-todo tool / batch-analyze 创建了新 todo
当   (When)   todo 成功写入数据库后
那么 (Then)   异步调用 getEmbedding(text) 获取向量
并且 (And)    INSERT INTO todo_embedding(todo_id, embedding) VALUES($1, $2)
             ON CONFLICT(todo_id) DO UPDATE SET embedding = EXCLUDED.embedding
并且 (And)    写入失败不影响主流程
```

### 场景 B4: Goal（level>=1 的 todo）创建时写入 goal_embedding
```
假设 (Given)  创建了 level>=1 的 todo（即目标/项目）
当   (When)   todo 成功写入数据库后
那么 (Then)   异步写入 goal_embedding（与 B3 同理，按 level 路由到对应表）
```

### 场景 B5: goal-auto-link 语义匹配生效
```
假设 (Given)  strike 表已有带 embedding 的记录
当   (When)   新目标创建触发 goalAutoLink()
那么 (Then)   SQL `1 - (s.embedding <=> ...)` 返回有效相似度分数
并且 (And)    相似度 >= 0.7 的 cluster 被自动关联到目标
并且 (And)    不再走 catch 静默失败路径
```

### 场景 B6: knowledge-lifecycle 语义演进生效
```
假设 (Given)  strike 表已有带 embedding 的记录
当   (When)   知识生命周期模块扫描语义相似 strike
那么 (Then)   SQL 余弦距离操作正常执行
并且 (And)    相似度 > 0.75 的 strike 被识别为演进关系
```

### 场景 B7: retrieval 模块切换到 DB 向量搜索
```
假设 (Given)  retrieval.ts 当前用应用层逐条 getEmbedding() + cosineSimilarity()
当   (When)   strike.embedding 列已填充
那么 (Then)   retrieval 改为 SQL pgvector 查询
             SELECT *, 1 - (embedding <=> $1) as similarity
             FROM strike WHERE user_id = $2 AND embedding IS NOT NULL
             ORDER BY embedding <=> $1 LIMIT $3
并且 (And)    消除 O(N) API 调用，改为 O(logN) 索引查询
并且 (And)    保留 getEmbedding() 仅用于查询向量生成（1 次 API 调用/查询）
```

### 场景 B8: Embedding API 不可用时降级
```
假设 (Given)  DashScope embedding API 不可用或超时
当   (When)   strike 创建 / todo 创建触发 embedding 写入
那么 (Then)   embedding 列保持 NULL
并且 (And)    主流程（digest/todo-projector）正常完成
并且 (And)    后续查询通过 WHERE embedding IS NOT NULL 自动跳过无向量记录
并且 (And)    日志输出 [embedding] 级别警告
```

---

## C 部分：配套代码清理

### 场景 C1: link-device 回填表更新
```
假设 (Given)  goal 已变为 VIEW，weekly_review 已 DROP
当   (When)   用户注册后绑定设备
那么 (Then)   link-device.ts 回填列表中不含 "goal" 和 "weekly_review"
并且 (And)    包含 "todo"（补上 todo.user_id 回填）
```

### 场景 C2: domain 值统一为中文
```
假设 (Given)  time-estimator.ts 的 AI prompt 使用英文 domain (work/life...)
当   (When)   修改 prompt 和默认值为中文
那么 (Then)   AI 返回的 domain 值为中文（工作/生活/...）
并且 (And)    与 onboarding.ts、batch-analyze-prompt.ts 一致
并且 (And)    不触发 DB CHECK 约束违反
```

### 场景 C3: 死代码清理
```
假设 (Given)  customer_request/setting_change 表已 DROP
当   (When)   清理相关代码
那么 (Then)   删除 customer-request.ts 和 setting-change.ts 仓库文件
并且 (And)    从 repositories/index.ts 移除对应 export
并且 (And)    清理 process.ts 中 /* MOVED TO DIGEST */ 注释块内的引用
并且 (And)    清理 ProcessResult 接口中的 customer_requests/setting_changes 字段
并且 (And)    清理 process-prompt.ts 中对应的输出格式说明
```

---

## 边界条件

- [x] Supabase 的 pgvector 扩展预装可用（无需 CREATE EXTENSION）
- [ ] HNSW 索引在空表上创建（pgvector 0.5.0+ 支持）
- [ ] goal VIEW 上的 SELECT * 返回列名与旧 goal 表一致
- [ ] DROP TABLE goal CASCADE 后 todo.goal_id FK 正确重建
- [ ] embedding 写入并发：多条 Strike 同时创建时不互相阻塞
- [ ] embedding 维度一致：所有写入点均使用 1024 维（DashScope text-embedding-v3）
- [ ] domain CHECK 约束：AI 返回未知值时代码侧需 fallback 到 '工作'

---

## 接口约定

### embedding 写入工具函数（新建）

```typescript
// gateway/src/cognitive/embed-writer.ts

/** 为 strike 异步写入 embedding，失败静默 */
export async function writeStrikeEmbedding(strikeId: string, nucleus: string): Promise<void>;

/** 为 todo 异步写入 embedding，按 level 路由到对应表 */
export async function writeTodoEmbedding(todoId: string, text: string, level: number): Promise<void>;

/** 批量为已有 strike 补写 embedding（用于迁移/修复） */
export async function backfillStrikeEmbeddings(userId: string, batchSize?: number): Promise<number>;
```

### strikeRepo.create 扩展

```typescript
// 新增 embedding 可选字段
export async function create(fields: {
  // ... 现有字段
  embedding?: number[];  // 可选，直接传入则跳过异步计算
}): Promise<StrikeEntry>;
```

---

## 依赖

- pgvector 扩展（Supabase 预装）
- DashScope text-embedding-v3 API（`DASHSCOPE_API_KEY` 环境变量）
- `gateway/src/memory/embeddings.ts` — `getEmbedding()` 函数

---

## 关键文件清单

| 操作 | 文件路径 |
|---|---|
| **新建** | `supabase/migrations/042_schema_cleanup.sql` |
| **新建** | `gateway/src/cognitive/embed-writer.ts` |
| **新建** | `gateway/src/cognitive/embed-writer.test.ts` |
| **修改** | `gateway/src/db/repositories/strike.ts` — create() 支持 embedding 字段 |
| **修改** | `gateway/src/handlers/digest.ts` — Strike 创建后调用 writeStrikeEmbedding |
| **修改** | `gateway/src/cognitive/batch-analyze.ts` — cluster 创建后写入 embedding |
| **修改** | `gateway/src/cognitive/emergence.ts` — L2 cluster 创建后写入 embedding |
| **修改** | `gateway/src/cognitive/top-level.ts` — 顶层维度创建后写入 embedding |
| **修改** | `gateway/src/cognitive/todo-projector.ts` — todo 创建后写入 todo_embedding |
| **修改** | `gateway/src/cognitive/retrieval.ts` — 切换到 pgvector SQL 查询 |
| **修改** | `gateway/src/tools/definitions/create-todo.ts` — todo 创建后写入 embedding |
| **修改** | `gateway/src/auth/link-device.ts` — 移除 goal/weekly_review |
| **修改** | `gateway/src/proactive/time-estimator.ts` — domain 英文→中文 |
| **修改** | `gateway/src/handlers/process.ts` — 清理死代码 |
| **修改** | `gateway/src/handlers/process-prompt.ts` — 清理 prompt 字段 |
| **修改** | `gateway/src/db/repositories/index.ts` — 移除死 export |
| **删除** | `gateway/src/db/repositories/customer-request.ts` |
| **删除** | `gateway/src/db/repositories/setting-change.ts` |

---

## 验证步骤

1. **Migration**: psql 执行 042，无报错
2. **VIEW**: `SELECT * FROM goal LIMIT 1` 返回正确列
3. **Embedding 列**: `\d strike` 显示 `embedding vector(1024)`
4. **表删除**: `\dt weekly_review` 不存在
5. **CHECK**: `INSERT INTO todo(text, domain) VALUES('test', 'invalid')` 报错
6. **单元测试**: `embed-writer.test.ts` 全部通过
7. **集成测试**: 录音 → Process → Digest → 确认 `strike.embedding IS NOT NULL`
8. **回归测试**: `pnpm test` 全部通过
9. **端到端**: chat 中说"帮我创建个待办" → 确认 todo + todo_embedding 均写入
10. **语义匹配**: 创建目标 → goalAutoLink 返回有效 cluster 关联（非空 catch）

---

## 备注

- Embedding 写入采用"火后不管"异步模式（`void writeStrikeEmbedding(...)`），不 await，不阻塞主链路
- backfillStrikeEmbeddings 用于未来补写历史数据，本次不执行
- retrieval.ts 的 pgvector 切换（场景 B7）是可选优化，可在本轮或下轮完成；优先保证写入链路通畅
