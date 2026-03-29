# gene_cognitive_engine — 认知引擎

## 概述

认知层架构。将用户输入（语音/文字/多模态）消化为 Strike（认知触动），通过 Bond 建立关系网络，由 Cluster 涌现高阶认知结构。

核心使命：链接认知与行动。不预设结构，让结构从数据中涌现。

## Strike 模型

一个 Strike = 一次意义发生的最小事件。四要素：

| 要素 | 说明 |
|------|------|
| 内核 (nucleus) | 最小语义单元，独立可理解的完整命题 |
| 极性 (polarity) | 一级字段：perceive/judge/realize/intend/feel |
| 场 (field) | JSONB，时空与状态上下文（timestamp/life_phase/space/energy/mood/social_context） |
| 键 (bond) | 与其他 Strike 的连接（动态生长） |

### 极性定义

| 极性 | 朝向 | 系统行为 |
|------|------|---------|
| perceive | 外部→自我 | 可被验证或推翻 |
| judge | 自我→外部 | 只能被支持或反对 |
| realize | 内部重组 | 认知跃迁，权重最高 |
| intend | 现在→未来 | 有完成/未完成状态 |
| feel | 内在非理性 | 不参与逻辑推理链 |

### 生命周期

`active → superseded → archived`

superseded_by 指针保留认知考古——被取代的 Strike 不删除，参与过的决策链保持完整。

## Bond 类型

软建议列表（AI 可自创）：`causal, contradiction, resonance, evolution, supports, context_of, elaborates, triggers, resolves, depends_on, perspective_of, abstracted_from`

Strength 0-1，会演化：长期未加强衰减，反复出现上升。

## 数据库

```
strike — 认知触动（含 cluster，is_cluster=true）
bond — 关系（source_strike_id, target_strike_id, type, strength）
strike_tag — 自由标签
cluster_member — 聚类成员关系
record.digested / record.digested_at — 消化追踪
```

## Digest 管道（v2 两级架构）

### Tier1: 实时 Strike 拆解

**触发**：
- 路径 A：Process 完成后 `shouldDigestImmediately()`（reflection/goal/complaint + 文本>80字）→ 立即
- 路径 B：Cron 每 3 小时 → 查 undigested 记录 → 批量
- 路径 C：Onboarding 冷启动 5 问 → 每步立即 Digest

**流程**（1 次 AI 调用）：
0. `claimForDigest()` 原子抢占 record（防并发重复 digest）
1. 加载记录 summary + 原文
2. AI 拆解为 Strike + 内部 bond
3. 写入 strike / bond / strike_tag（含 source_id + nucleus 去重）
4. intend Strike 自动投影为 todo/goal
5. 新 Strike 自动关联已有目标
6. 记忆/Soul/Profile 更新
7. 新 Strike 数 ≥ 5 → 触发 Tier2

**失败回滚**：AI 调用或管道失败时 `unclaimDigest()` 恢复 digested=false，允许重试。

### Tier2: 批量认知分析（batch-analyze.ts）

**触发**（OR 逻辑）：
- 累计 ≥ 5 个新 Strike → Tier1 结束时自动触发
- 每日凌晨 3 点 daily-cycle.ts 编排

**流程**（1 次 AI 调用，替代 v1 的 7 个模块）：
1. 读取 cognitive_snapshot（压缩的认知结构快照，≤5K token）
2. 加载 last_analyzed_strike_id 之后的新 Strike
3. 单次 AI 调用：聚类分配、新聚类、合并、矛盾、模式、目标涌现
4. 9 种结果批量写入 DB
5. 更新 snapshot（乐观锁 version 字段）

**每日完整周期**（daily-cycle.ts）：
1. `runBatchAnalyze(userId)` — Tier2 批量分析
2. 维护 — Bond type 归一化 + Strength/Salience 衰减
3. `generateCognitiveReport()` — 认知报告

**Cognitive Snapshot**（cognitive_snapshot 表）：
- 存储聚类、目标、矛盾、模式的压缩 JSON
- `last_analyzed_strike_id` 指针实现增量分析
- 乐观锁防止并发写入冲突
- 大小控制：50 cluster / 30 goal / 20 contradiction / 20 pattern

## Strike 去重机制

**两层防重，避免并发或重试产生重复 Strike：**

| 层级 | 机制 | 位置 |
|------|------|------|
| Record 级 | `claimForDigest()` 原子抢占：`UPDATE ... WHERE digested=false RETURNING id` | record.ts |
| Strike 级 | `existsBySourceAndNucleus(source_id, nucleus)` 写入前查重 | strike.ts + digest.ts |
| 失败回滚 | `unclaimDigest()` 恢复 digested=false 允许重试 | record.ts + digest.ts |

**防重场景覆盖：**
- redigest 手动重跑 → claimForDigest 过滤已消化的 record
- proactive batch digest 并发 → 同一 record 只有一个进程抢占成功
- process + batch digest 竞争 → 原子 UPDATE 保证互斥
- AI 幂等性兜底 → Strike 级 (source_id, nucleus) 去重

## 混合检索

`cognitive/retrieval.ts` — hybridRetrieve()

| 通道 | 方法 | 说明 |
|------|------|------|
| A 语义 | embedding cosine similarity | top-5 相似 Strike |
| B1 同 tag | strike_tag 交集 | 共享标签的 Strike |
| B2 同人物 | 中文姓名正则 + tag 匹配 | 涉及同一人的 Strike |
| B3 同时间 | created_at ±7天 | 时间窗口内的 Strike |
| B4 反向极性 | 语义相近 + polarity 不同 | 矛盾检测候选 |
| C cluster | 先找相关 cluster 再找成员 | Phase 2 后可用 |

合并去重，综合得分 = similarity × 0.6 + structuredHits × 0.4

## 质量校验

- 前端 StrikePreview：极性图标 + nucleus + confidence
- 用户可修改 nucleus/polarity，标记 created_by = "user"
- Phase 3+：用户纠正数据 → Digest prompt 自我改进闭环

## 关键文件

| 文件 | 职责 |
|------|------|
| `supabase/migrations/017_cognitive_layer.sql` | 认知层四表 + record 扩展 |
| `supabase/migrations/029_cognitive_snapshot.sql` | cognitive_snapshot 表 |
| `supabase/migrations/030_strike_source_cascade.sql` | strike.source_id ON DELETE SET NULL |
| `gateway/src/db/repositories/strike.ts` | Strike CRUD + existsBySourceAndNucleus 去重 |
| `gateway/src/db/repositories/bond.ts` | Bond CRUD（含批量创建） |
| `gateway/src/db/repositories/strike-tag.ts` | Tag CRUD |
| `gateway/src/db/repositories/snapshot.ts` | Cognitive snapshot CRUD（乐观锁） |
| `gateway/src/db/repositories/record.ts` | Record CRUD + claimForDigest/unclaimDigest |
| `gateway/src/handlers/digest.ts` | Tier1 主管道（原子抢占 + Strike 去重） |
| `gateway/src/handlers/digest-prompt.ts` | Digest AI prompt 构建 |
| `gateway/src/cognitive/batch-analyze.ts` | Tier2 批量分析引擎（单次 AI 调用） |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | Tier2 AI prompt 构建 |
| `gateway/src/cognitive/retrieval.ts` | 混合检索模块 |
| `gateway/src/handlers/process.ts` | shouldDigestImmediately + 触发 |
| `gateway/src/proactive/engine.ts` | 3h cron 批量 digest + 每日/每周认知周期 |
| `gateway/src/routes/strikes.ts` | REST API |
| `gateway/src/cognitive/maintenance.ts` | 维护（归一化+衰减） |
| `gateway/src/cognitive/daily-cycle.ts` | 每日认知周期编排（3 步） |
| `features/notes/components/strike-preview.tsx` | 前端 Strike 展示 + 编辑 |
| `features/notes/hooks/use-strikes.ts` | 懒加载 hook |
| `shared/lib/api/strikes.ts` | 前端 API 客户端 |

## HTTP 层

- `gateway/src/lib/http-helpers.ts` 的 `sendJson()` / `sendError()` 统一返回 `Content-Type: application/json; charset=utf-8`
- `gateway/src/companion/chat-generator.ts` 使用 `chatCompletion()` 而非已删除的 `callAI()`

## 前端 Overlay 架构

- `app/page.tsx` 的 `<AnimatePresence mode="wait">` 内使用链式三元表达式（而非多个 `&&`），确保同时只有一个带 key 的子节点，避免 React "duplicate key" 警告
- 每个 overlay 组件必须有唯一 `key` prop

## 设计文档

完整架构设计见 [PLAN-cognitive-engine.md](../PLAN-cognitive-engine.md)
