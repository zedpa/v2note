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

## Digest 管道

### Level 1: Strike 拆解（Phase 1 已实现）

**触发**：
- 路径 A：Process 完成后 `shouldDigestImmediately()`（reflection/goal/complaint + 文本>80字）→ 立即
- 路径 B：Cron 每 3 小时 → 查 undigested 记录 → 批量

**流程**（2 次 AI 调用）：
1. 加载记录 summary + 原文
2. AI 拆解为 Strike + 内部 bond
3. 写入 strike / bond / strike_tag
4. 混合检索历史 Strike（语义 + 结构化双通道）
5. AI 判断跨记录 bond + supersede
6. 标记 record.digested = true

### Level 2: 关联聚类 + 矛盾检测 + 融合（每日，Phase 2）

- 聚类：三角闭合度检测 → cluster 创建
- 矛盾扫描：同主题反向极性 Strike 主动检测
- 融合（Promote）：重复 Strike 提升为高阶 Strike + abstracted_from bond
- 维护：bond type 归一化，strength/salience 衰减

### Level 3: 涌现（每周，Phase 3）

- cluster 间关系 → 高阶结构
- cluster 演化检测（增长/萎缩/分裂/合并）
- 认知模式提炼
- 冲突检测 + 推送

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
| `gateway/src/db/repositories/strike.ts` | Strike CRUD |
| `gateway/src/db/repositories/bond.ts` | Bond CRUD（含批量创建） |
| `gateway/src/db/repositories/strike-tag.ts` | Tag CRUD |
| `gateway/src/handlers/digest.ts` | Digest Level 1 主管道 |
| `gateway/src/handlers/digest-prompt.ts` | Digest AI prompt 构建 |
| `gateway/src/cognitive/retrieval.ts` | 混合检索模块 |
| `gateway/src/handlers/process.ts` | shouldDigestImmediately + 触发 |
| `gateway/src/proactive/engine.ts` | 3h cron 批量 digest |
| `gateway/src/routes/strikes.ts` | REST API |
| `features/notes/components/strike-preview.tsx` | 前端 Strike 展示 + 编辑 |
| `features/notes/hooks/use-strikes.ts` | 懒加载 hook |
| `shared/lib/api/strikes.ts` | 前端 API 客户端 |

## 设计文档

完整架构设计见 [PLAN-cognitive-engine.md](../PLAN-cognitive-engine.md)
