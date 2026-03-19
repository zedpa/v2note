# ACTIVE_TASKS.md — 认知引擎 Phase 2 执行方案

> Phase 1 已完成并提交。
> 设计文档：[docs/PLAN-cognitive-engine.md](docs/PLAN-cognitive-engine.md)
> Phase 2 目标：Level 2 每日聚类 + 矛盾检测 + 融合 + 维护机制

---

## TASK-CE-07: Level 2 聚类引擎

**复杂度**: L（1天）
**前置**: Phase 1 完成
**涉及文件**:
- `gateway/src/cognitive/clustering.ts`（新建）
- `gateway/src/cognitive/clustering-prompt.ts`（新建）

**具体任务**:
1. 实现三角闭合度聚类算法：
   - 输入：某用户的所有 active Strike + 它们之间的 bond
   - 对每个 Strike，取直接邻居（bond 的另一端）
   - 计算邻居间是否也互相连接（三角闭合度）
   - 三角密度高的区域 = cluster 候选
2. AI 审核 cluster 候选：
   - 把候选 Strike 组给 AI，判断是否构成有意义的 cluster
   - AI 命名 cluster + 生成描述
3. 创建 cluster：
   - 创建 is_cluster=true 的 Strike（nucleus = cluster 描述）
   - 写入 cluster_member 关系
   - 计算 cluster 聚合 embedding（成员 embedding 平均）
4. 已有 cluster 的增量更新：
   - 新 Strike 如果和某个 cluster 的成员高度关联 → 归入
   - 更新 cluster embedding 和描述

**验收标准**:
- [ ] 给定一组有高密度 bond 的 Strike，能自动识别出 cluster
- [ ] Cluster 有 AI 生成的 nucleus 描述
- [ ] cluster_member 关系正确写入
- [ ] 已有 cluster 可以接收新成员

---

## TASK-CE-08: 主动矛盾扫描

**复杂度**: M（半天）
**前置**: Phase 1 完成
**涉及文件**:
- `gateway/src/cognitive/contradiction.ts`（新建）

**具体任务**:
1. 取最近 N 天新增的 Judge / Perceive 类 Strike
2. 对每个新 Strike，用混合检索（通道 B4 反向极性）找候选对立 Strike
3. 把候选对给 AI 判断：
   - 真正矛盾 → 建 contradiction bond
   - 不同视角 → 建 perspective_of bond
   - 无关 → 跳过
4. 矛盾结果可选推送给用户（通过 proactive engine）

**验收标准**:
- [ ] 能找到同主题但立场相反的 Strike 对
- [ ] AI 能区分 contradiction vs perspective_of
- [ ] 矛盾 bond 正确写入

---

## TASK-CE-09: 融合（Promote）

**复杂度**: M（半天）
**前置**: TASK-CE-07
**涉及文件**:
- `gateway/src/cognitive/promote.ts`（新建）

**具体任务**:
1. 在聚类结果中识别"本质说同一件事"的 Strike 组
   - 区分于普通 cluster：cluster 是"经常一起出现"（拓扑），promote 是"本质相同"（语义）
2. AI 生成更高阶的 nucleus（抽象概括）
3. 创建新 Strike（is_cluster=true） + abstracted_from bond 连接每个底层 Strike
4. 底层 Strike 保留 active 状态（作为证据链）

**验收标准**:
- [ ] 3 个说"供应商延迟"的 Strike 被融合为"供应商存在系统性交期问题"
- [ ] abstracted_from bond 正确建立
- [ ] 底层 Strike 不被 archive

---

## TASK-CE-10: 维护机制（衰减 + 归一化）

**复杂度**: S（1h）
**前置**: Phase 1 完成
**涉及文件**:
- `gateway/src/cognitive/maintenance.ts`（新建）

**具体任务**:
1. Bond type 归一化：
   - 扫描所有 bond，合并同义 type（causes/caused_by/leads_to → causal）
   - 维护一个归一化映射表
2. Strength 衰减：
   - 超过 30 天未被新 bond 加强的 → strength × 0.9
   - 超过 90 天 → strength × 0.7
3. Salience 衰减：
   - Strike 超过 30 天未被引用（出现在 bond 中或被检索命中）→ salience × 0.95
   - 被引用时 → salience 回升至 min(1.0, salience + 0.1)

**验收标准**:
- [ ] 归一化后 bond type 种类减少
- [ ] 老 bond 的 strength 自动衰减
- [ ] 被频繁引用的 Strike salience 保持高位

---

## TASK-CE-11: 每日 Cron 注册 + 编排

**复杂度**: S（1h）
**前置**: CE-07, CE-08, CE-09, CE-10
**涉及文件**:
- `gateway/src/proactive/engine.ts`（改造）
- `gateway/src/cognitive/daily-cycle.ts`（新建）

**具体任务**:
1. 创建 daily-cycle.ts 编排函数：
   ```
   async function runDailyCognitiveCycle(userId: string) {
     // 2a. 聚类
     await runClustering(userId);
     // 2b. 矛盾扫描
     await runContradictionScan(userId);
     // 2c. 融合
     await runPromote(userId);
     // 2d. 维护
     await runMaintenance(userId);
   }
   ```
2. 在 proactive engine 注册每日 cron（建议凌晨 3:00）
3. 查询所有活跃用户，逐个执行 daily cycle

**验收标准**:
- [ ] Cron 每日触发
- [ ] 四个步骤按序执行
- [ ] 单个用户失败不影响其他用户

---

## TASK-CE-12: 混合检索通道 C（cluster 层面）

**复杂度**: S（1h）
**前置**: CE-07
**涉及文件**:
- `gateway/src/cognitive/retrieval.ts`（改造）

**具体任务**:
1. 在 hybridRetrieve 中添加通道 C：
   - 用新 Strike 的 embedding 在 cluster Strike 中搜索相似 cluster
   - 找到相关 cluster 后，加载其 member Strike
   - 从 member 中选最相关的 3 个加入结果
2. 通道 C 失败不影响 A+B

**验收标准**:
- [ ] 有 cluster 时，检索结果包含 cluster 成员
- [ ] 无 cluster 时，graceful fallback

---

## 执行顺序

```
CE-10（维护，独立）
CE-08（矛盾扫描，独立）
CE-07（聚类引擎）──→ CE-09（融合）──→ CE-12（检索通道C）
                                        │
所有完成后 ──→ CE-11（每日 Cron 编排）
```

**建议执行序**：CE-10 → CE-08 → CE-07 → CE-09 → CE-12 → CE-11

---

*创建时间：2026-03-19*
*状态：待启动 CE-10*
