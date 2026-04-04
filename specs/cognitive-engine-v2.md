---
id: "067"
title: "认知引擎 v2 — 单次批量分析"
status: completed
domain: cognitive
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 认知引擎 v2 — 单次批量分析

> 状态：✅ completed | 优先级：Phase 0（最高优先）
> 完成日期: 2026-03-27 — batch-analyze.ts + prompt + daily-cycle 重写 + 7个旧文件删除
> 依赖：cognitive-snapshot
> 替代：emergence-chain, cold-start-bonds, cluster-tag-sync, contradiction-detection（均并入本 spec）

## 概述

将现有 8 文件多步管线（embedding→图构建→三角闭合→BFS→逐候选AI审核→跨聚类O(n²)→共振检测→模式提取）替换为**两层架构**：

- **Tier1 实时 digest**：每条记录 1 次 AI 调用，分解 Strike + todo 投影（保持现有）
- **Tier2 批量分析**：累积触发 1 次 AI 调用，一次性输出全部结构信息（聚类/Bond/矛盾/模式/目标涌现）

### 为什么重构

| | v1 多步管线 | v2 单次批量 |
|--|------------|------------|
| AI 调用 | 5-15次/批（串行） | **1次** |
| 延迟 | 60-180秒 | **10-20秒** |
| 代码量 | ~1500行/8文件 | **~300行/2文件** |
| 聚类质量 | embedding 几何距离 | **语义推理（SIGIR 2025 证明更优）** |
| 可调性 | 改代码+阈值 | **改 prompt** |

### 架构决策

- **Tier1 digest 简化**：砍掉第 2 次 AI 调用（跨链 Bond），跨 Strike 关系由 Tier2 统一发现
- **Tier2 输入压缩**：已有结构通过 cognitive_snapshot 压缩为 ≤5K tokens，无论用户历史多长
- **触发条件 OR 逻辑**：累计 5 个新 Strike 触发 OR 每日 3AM 触发，先到先执行
- **模型**：统一使用 qwen3-max，后续按需调整

---

## 场景

### 场景 1: Tier1 — 单条记录实时 digest（简化版）

```
假设 (Given)  用户提交一条语音/文字/图片/URL 记录
并且 (And)    record 已完成 ASR 转写或文本提取
当   (When)   digestRecords() 被调用
那么 (Then)   1 次 AI 调用，输出 strikes[] + 内部 bonds[]
并且 (And)    写入 Strike + StrikeTag + 内部 Bond
并且 (And)    intend 类 Strike 自动投影为 todo/goal（todo-projector 不变）
并且 (And)    Memory/Soul/Profile 异步更新（不变）
并且 (And)    不再做跨链 Bond（第 2 次 AI 调用砍掉）
并且 (And)    检查是否触发 Tier2（新 Strike 累计 ≥ 5）
```

### 场景 2: Tier2 — 批量分析触发（累计触发）

```
假设 (Given)  自上次 Tier2 分析后，累计产生了 5 个新 Strike
当   (When)   Tier1 digest 完成后检查触发条件
那么 (Then)   异步启动 Tier2 批量分析（不阻塞 digest 返回）
并且 (And)    同一用户不并发执行 Tier2（加锁，重复触发跳过）
```

### 场景 3: Tier2 — 批量分析触发（定时触发）

```
假设 (Given)  每日 3AM 定时任务执行
并且 (And)    用户有未分析的新 Strike（last_strike_id 之后有新记录）
当   (When)   定时任务调用 runBatchAnalyze(userId)
那么 (Then)   执行 Tier2 批量分析
并且 (And)    如果没有新 Strike，跳过（不做空调用）
```

### 场景 4: Tier2 — 增量分析（有 snapshot）

```
假设 (Given)  cognitive_snapshot 存在，包含已有聚类/目标/矛盾/模式
并且 (And)    有 30 条新 Strike（自 last_analyzed_strike_id 之后）
当   (When)   runBatchAnalyze(userId) 执行
那么 (Then)   从 DB 读取 cognitive_snapshot（已有结构，≤5K tokens）
并且 (And)    从 DB 读取新增 Strike 列表（nucleus + polarity + tags）
并且 (And)    构建 prompt：结构摘要 + 新 Strike 列表
并且 (And)    1 次 AI 调用（qwen3-max, json mode, temperature 0.3）
并且 (And)    AI 输出包含以下全部字段：
              - assign: 新 Strike → 已有聚类的分配
              - new_clusters: 新发现的主题聚类
              - merge_clusters: 应合并的聚类对
              - bonds: 跨 Strike 关系（含类型和强度）
              - contradictions: 矛盾检测
              - patterns: 认知模式提取
              - goal_suggestions: 涌现目标建议
              - supersedes: 知识更新（新观点替代旧观点）
              - tags: 聚类标签反写建议
并且 (And)    解析输出，批量写入 DB
并且 (And)    更新 cognitive_snapshot
```

### 场景 5: Tier2 — 冷启动（无 snapshot）

```
假设 (Given)  用户首次运行 Tier2（cognitive_snapshot 不存在）
并且 (And)    用户已有 80 条 Strike
当   (When)   runBatchAnalyze(userId) 执行
那么 (Then)   取全部 Strike（≤300 条，按时间倒序）
并且 (And)    无结构摘要，prompt 中标注"首次分析"
并且 (And)    AI 从零开始输出完整结构（聚类 + Bond + 目标 + 模式）
并且 (And)    创建 cognitive_snapshot
```

### 场景 6: Tier2 — 超大量 Strike（>300 条冷启动）

```
假设 (Given)  用户导入大量数据（如 flomo 500 条），Strike 总数 > 300
并且 (And)    cognitive_snapshot 不存在
当   (When)   runBatchAnalyze(userId) 执行
那么 (Then)   取最近 300 条 Strike（按时间倒序）
并且 (And)    AI 分析这 300 条，建立初始结构
并且 (And)    创建 cognitive_snapshot（last_analyzed_strike_id = 第 300 条的 id）
并且 (And)    剩余更早的 Strike 在后续增量分析中逐步消化
```

### 场景 7: Tier2 — AI 输出解析与 DB 写入

```
假设 (Given)  AI 返回 JSON 结构化输出
当   (When)   解析 assign 字段
那么 (Then)   对每个 {strike_id, cluster_id} → 创建 bond(type='cluster_member')

当   (When)   解析 new_clusters 字段
那么 (Then)   对每个 {name, description, polarity, member_strike_ids}
              → 创建 Cluster Strike (is_cluster=true, level=1)
              → 批量创建 cluster_member Bond

当   (When)   解析 merge_clusters 字段
那么 (Then)   对每个 {cluster_a_id, cluster_b_id, new_name}
              → 创建新 Cluster，成员 = A∪B
              → 旧 Cluster 标记 status='merged'
              → 更新引用旧 cluster_id 的 Goal

当   (When)   解析 bonds 字段
那么 (Then)   批量创建 Bond (created_by='batch-analyze')

当   (When)   解析 contradictions 字段
那么 (Then)   创建 Bond(type='contradiction') + 可选 alert

当   (When)   解析 patterns 字段
那么 (Then)   创建 realize Strike (source_type='inference') + evidence Bond

当   (When)   解析 goal_suggestions 字段
那么 (Then)   创建 Goal (source='emerged', status='suggested')
              → 关联到对应 Cluster

当   (When)   解析 supersedes 字段
那么 (Then)   旧 Strike 标记 status='superseded', superseded_by=新 Strike id

当   (When)   解析 tags 字段
那么 (Then)   批量写入 strike_tag
```

### 场景 8: Tier2 — material 降权

```
假设 (Given)  新 Strike 中包含 source_type='material'（来自 PDF/URL/图片）
当   (When)   构建 prompt
那么 (Then)   material Strike 在列表中标注 [素材]
并且 (And)    prompt 指令明确：素材只被动吸附到已有聚类，不参与涌现新聚类/目标
并且 (And)    素材 Strike 不计入 intend 密度（不触发目标涌现）
```

### 场景 9: Tier2 — 并发保护

```
假设 (Given)  Tier2 正在运行中（锁未释放）
当   (When)   新的 Tier2 触发条件满足
那么 (Then)   跳过本次触发，不重复执行
并且 (And)    日志记录 "[batch-analyze] Skipped: already running"
```

### 场景 10: Tier2 — AI 调用失败

```
假设 (Given)  AI 调用超时或返回非法 JSON
当   (When)   解析失败
那么 (Then)   不更新 cognitive_snapshot（下次重试时包含本次未分析的 Strike）
并且 (And)    不清除已写入的 Strike（Tier1 数据不受影响）
并且 (And)    日志记录错误，不抛出（不影响主流程）
并且 (And)    下次触发条件满足时自动重试
```

### 场景 11: Tier1 digest 简化 — 去掉跨链 AI 调用

```
假设 (Given)  现有 digest.ts Step 5-6 做第 2 次 AI 调用（跨链 Bond）
当   (When)   v2 重构
那么 (Then)   删除 Step 5（历史 Strike 检索）和 Step 6（跨链 AI 调用）
并且 (And)    删除 Step 9（异步 clustering 触发）
并且 (And)    替换为：检查新 Strike 累计数，满足条件时触发 Tier2
并且 (And)    digest 从 2 次 AI 调用 → 1 次，延迟减半
```

### 场景 12: daily-cycle 简化

```
假设 (Given)  现有 daily-cycle.ts 编排 8 步（clustering→emergence→contradiction→promote→alerts→maintenance→tag-sync→report）
当   (When)   v2 重构
那么 (Then)   daily-cycle 简化为 3 步：
              1. runBatchAnalyze(userId) — 替代前 6 步
              2. maintenance（Bond 衰减 + salience 衰减）— 保留
              3. generateCognitiveReport(userId) — 保留
```

---

## 接口约定

### Tier2 Prompt 输入结构

```typescript
// 传给 AI 的输入（拼接为 prompt）
interface BatchAnalyzeInput {
  // 已有结构摘要（来自 cognitive_snapshot）
  existing_structure: {
    clusters: Array<{
      id: string;
      name: string;
      description: string;
      size: number;       // 成员数
      polarity: string;   // 主极性
      level: number;      // 1=主题, 2=大主题, 3=领域
    }>;
    goals: Array<{
      id: string;
      title: string;
      status: string;
      cluster_id?: string;
    }>;
    active_contradictions: Array<{
      strike_a_nucleus: string;
      strike_b_nucleus: string;
      description: string;
    }>;
    known_patterns: Array<{
      pattern: string;
      confidence: number;
    }>;
  };

  // 新增 Strike 列表
  new_strikes: Array<{
    id: string;
    nucleus: string;
    polarity: string;          // perceive|judge|realize|intend|feel
    tags: string[];
    source_type: string;       // think|material
    created_at: string;        // ISO date
  }>;
}
```

### Tier2 AI 输出结构

```typescript
interface BatchAnalyzeOutput {
  // 1. 新 Strike → 已有聚类分配
  assign: Array<{
    strike_id: string;
    cluster_id: string;
  }>;

  // 2. 新发现的聚类
  new_clusters: Array<{
    name: string;
    description: string;
    polarity: string;          // 主极性
    member_strike_ids: string[];
    level: 1;
  }>;

  // 3. 聚类合并建议
  merge_clusters: Array<{
    cluster_a_id: string;
    cluster_b_id: string;
    new_name: string;
    reason: string;
  }>;

  // 4. 跨 Strike 关系（含新旧 Strike 之间）
  bonds: Array<{
    source_strike_id: string;
    target_strike_id: string;
    type: string;              // context_of|causal|temporal|support|contrast
    strength: number;          // 0-1
  }>;

  // 5. 矛盾检测
  contradictions: Array<{
    strike_a_id: string;
    strike_b_id: string;
    description: string;       // 矛盾描述
    severity: "low" | "medium" | "high";
  }>;

  // 6. 认知模式
  patterns: Array<{
    pattern: string;           // 一句话描述
    evidence_strike_ids: string[];
    confidence: number;        // 0-1
  }>;

  // 7. 涌现目标建议
  goal_suggestions: Array<{
    title: string;
    reason: string;            // 为什么建议这个目标
    cluster_id?: string;       // 关联的聚类（已有或新建）
    source_strike_ids: string[]; // 支撑 Strike
  }>;

  // 8. 知识更新
  supersedes: Array<{
    new_strike_id: string;
    old_strike_id: string;
    reason: string;
  }>;

  // 9. 聚类标签反写
  cluster_tags: Array<{
    cluster_id: string;
    tags: string[];            // 应标记到聚类的标签
  }>;
}
```

### 新增 API

```
POST /api/v1/cognitive/batch-analyze
  → 手动触发 Tier2 批量分析（替代现有 /cognitive/cycle）
  → 返回 { message: string, strike_count: number }
  → 异步执行，立即返回
```

### 触发条件配置

```typescript
const TIER2_STRIKE_THRESHOLD = 5;    // 累计 5 个新 Strike 触发
const TIER2_DAILY_HOUR = 3;          // 每日 3AM 触发
// OR 逻辑：先到先执行
```

---

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `gateway/src/cognitive/batch-analyze.ts` | **新建**：Tier2 核心，单次 AI 调用 + DB 写入 |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | **新建**：Tier2 prompt 构建 |
| `gateway/src/handlers/digest.ts` | **修改**：删除 Step 5-6-9，添加 Tier2 触发检查 |
| `gateway/src/cognitive/daily-cycle.ts` | **简化**：8步→3步 |
| `gateway/src/routes/cognitive-stats.ts` | **修改**：/cognitive/cycle → /cognitive/batch-analyze |
| `supabase/migrations/029_cognitive_snapshot.sql` | **新建**：snapshot 表 |
| `gateway/src/cognitive/clustering.ts` | **删除** |
| `gateway/src/cognitive/clustering-prompt.ts` | **删除** |
| `gateway/src/cognitive/emergence.ts` | **删除** |
| `gateway/src/cognitive/l2-emergence.ts` | **删除** |
| `gateway/src/cognitive/contradiction.ts` | **删除** |
| `gateway/src/cognitive/promote.ts` | **删除** |
| `gateway/src/cognitive/tag-sync.ts` | **删除** |

## AI 调用

- Tier1 digest：**1 次/条记录**（原来 2 次，砍掉跨链调用）
- Tier2 批量分析：**1 次/触发**（替代原来 5-15 次）
- 总计：从 7-17 次 AI 调用降至 **2 次**（1次 Tier1 + 1次 Tier2）

## 边界条件

- [ ] 新 Strike 为 0 时跳过 Tier2（不做空调用浪费 token）
- [ ] AI 输出引用了不存在的 strike_id → 跳过该条目，日志警告
- [ ] AI 输出引用了不存在的 cluster_id → 跳过该条目
- [ ] 新 Strike 数量 > 300 → 截断到最近 300 条
- [ ] Tier2 执行超时（>120s）→ 不更新 snapshot，下次重试
- [ ] 并发 Tier2 → 锁保护，跳过重复执行
- [ ] snapshot JSON 损坏 → 降级为冷启动模式
- [ ] material Strike 不参与目标涌现计算

## 验收标准

1. 导入 150 条 flomo 日记后，冷启动 Tier2 单次调用 ≤30 秒，产出聚类 + Bond + 目标
2. 后续每 5 条新 Strike 自动触发增量 Tier2，≤15 秒完成
3. 删除 7 个旧文件后，所有测试仍然通过
4. daily-cycle 从 8 步简化为 3 步，日志输出正确
