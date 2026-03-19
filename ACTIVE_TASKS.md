# ACTIVE_TASKS.md — 认知引擎 Phase 1 执行方案

> 设计文档：[docs/PLAN-cognitive-engine.md](docs/PLAN-cognitive-engine.md)
> Phase 1 目标：Digest 管道上线，Strike 模型落地，Process → Digest 触发链路跑通

---

## TASK-CE-01: 数据库 Migration — 认知层表

**复杂度**: M（半天）
**前置**: 无
**涉及文件**:
- `gateway/supabase/migrations/016_cognitive_layer.sql`（新建）
- `gateway/src/db/repositories/strike.ts`（新建）
- `gateway/src/db/repositories/bond.ts`（新建）
- `gateway/src/db/repositories/strike-tag.ts`（新建）

**具体任务**:
1. 创建 migration 016：
   - `strike` 表（id, user_id, nucleus, polarity, field, source_id, source_span, source_type, confidence, salience, embedding, status, superseded_by, is_cluster, created_at, digested_at）
   - `bond` 表（id, source_strike_id, target_strike_id, type, strength, created_by, created_at, updated_at）
   - `strike_tag` 表（id, strike_id, label, confidence, created_by, created_at）
   - `cluster_member` 表（cluster_strike_id, member_strike_id）
   - `record` 表加 `digested` + `digested_at` 列
   - 所有必要的索引（参见 PLAN 中的 schema）
2. 创建 repository 文件（CRUD + 查询方法）：
   - `strike.ts`: create, findByUser, findBySource, findActive, findUndigested, updateStatus, supersede
   - `bond.ts`: create, findByStrike, findByType, updateStrength
   - `strike-tag.ts`: create, findByStrike, findByLabel

**验收标准**:
- [ ] Migration 正向执行成功
- [ ] Migration 反向回滚成功
- [ ] 再次正向执行成功（幂等）
- [ ] Repository CRUD 方法可调用，TypeScript 编译通过
- [ ] record 表已有记录的 digested 默认为 FALSE

---

## TASK-CE-02: Digest Level 1 核心管道

**复杂度**: L（1天）
**前置**: TASK-CE-01
**涉及文件**:
- `gateway/src/handlers/digest.ts`（新建）
- `gateway/src/handlers/digest-prompt.ts`（新建）

**具体任务**:
1. 实现 `buildDigestPrompt()`：
   - 输入：待消化记录的 summary + 原文列表，可选的历史 Strike 上下文
   - 输出：system prompt，包含 Strike 拆解指令（nucleus + polarity + confidence + tags + bonds）
   - 包含完整的极性定义（Perceive/Judge/Realize/Intend/Feel）
   - 包含质量标准（独立性/最小性/归属明确）
   - JSON 输出格式定义
2. 实现 `digestRecords(recordIds, context)`：
   - Step 1: 从 DB 加载记录的 summary + 原文（transcriptRepo）
   - Step 2: 调用 AI 拆解为 Strike + 内部 bond（1 次 AI 调用）
   - Step 3: 解析 AI 返回的 JSON
   - Step 4: 为每个 Strike 生成 embedding（复用现有 embeddings.ts）
   - Step 5: 混合检索历史 Strike（通道 A: embedding top-5 + 通道 B: 结构化查询）
   - Step 6: 将新 Strike + 历史命中 一起给 AI，判断跨记录 bond + supersede（1 次 AI 调用）
   - Step 7: 批量写入 strike / bond / strike_tag 表
   - Step 8: 标记 record.digested = true, digested_at = now()
3. 错误处理：
   - AI 返回非法 JSON → 跳过本批，log 错误，不标记 digested
   - 单条 Strike 写入失败 → 继续处理其他 Strike，log 错误
   - embedding 生成失败 → Strike 仍然写入，embedding 字段留空

**验收标准**:
- [ ] 输入一条包含多个命题的记录，输出正确拆分的 Strike 数组
- [ ] 每个 Strike 有正确的 polarity
- [ ] 同记录内 Strike 之间有 bond
- [ ] 跨记录 bond 正确建立（需要已有历史 Strike）
- [ ] record.digested 被正确标记
- [ ] 各类错误不导致 crash

---

## TASK-CE-03: 混合检索模块

**复杂度**: M（半天）
**前置**: TASK-CE-01
**涉及文件**:
- `gateway/src/cognitive/retrieval.ts`（新建）

**具体任务**:
1. 实现 `hybridRetrieve(strike, userId, limit)`：
   - 通道 A（语义）：用 strike.embedding 在 strike 表中做向量相似度搜索 top-K
   - 通道 B（结构化）：
     - 同 tag 的 Strike（strike_tag.label 交集）
     - 涉及同一人物的（tag 中的人名匹配）
     - 同时间窗口的（created_at ±7天）
     - 同主题反向极性的（为矛盾检测预留）
   - 合并去重，按综合得分排序，返回 top-N
2. 向量搜索实现：
   - 优先使用 pgvector 的 `<=>` 运算符（如果已安装）
   - 降级方案：内存中计算余弦相似度（复用现有 embeddings.ts 的 cosineSimilarity）

**验收标准**:
- [ ] 纯语义通道返回语义相近的 Strike
- [ ] 结构化通道返回同 tag / 同人物的 Strike
- [ ] 两通道结果正确合并去重
- [ ] 无历史数据时返回空数组，不报错

---

## TASK-CE-04: Process → Digest 触发链路

**复杂度**: S（1h）
**前置**: TASK-CE-02
**涉及文件**:
- `gateway/src/handlers/process.ts`（改造末尾）
- `gateway/src/lib/text-utils.ts`（可能新增工具函数）

**具体任务**:
1. 在 process.ts 中添加深度判断函数：
   ```typescript
   function shouldDigestImmediately(result: ProcessResult, textLength: number): boolean {
     const deepTypes = new Set(["reflection", "goal", "complaint"]);
     const hasDeepIntent = result.intents.some(i => deepTypes.has(i.type));
     const isSubstantial = textLength > 80;
     return hasDeepIntent && isSubstantial;
   }
   ```
2. 在 process.ts 末尾（现有的 3 个后台任务区域）：
   - 判断 → 深度内容则立即调用 `digestRecords([payload.recordId], context)`
   - 浅内容 → 什么都不做，等 cron
3. **保留**现有的 maybeCreateMemory / updateSoul / updateProfile（Phase 1 暂不移除，并行运行，后续 Phase 迁移）

**验收标准**:
- [ ] 深度内容（reflection + >80字）触发 Digest
- [ ] 浅内容（"提醒我明天开会"）不触发 Digest
- [ ] Digest 失败不影响 Process 主流程
- [ ] 现有功能（memory/soul/profile 更新）不受影响

---

## TASK-CE-05: 3 小时 Cron 批量 Digest

**复杂度**: S（1h）
**前置**: TASK-CE-02
**涉及文件**:
- `gateway/src/proactive/engine.ts`（改造，添加 cron 任务）
- `gateway/src/db/repositories/record.ts`（新增 findUndigested）

**具体任务**:
1. record repository 新增 `findUndigested(userId)` 方法：
   ```sql
   SELECT * FROM record
   WHERE user_id = $1
     AND digested = FALSE
     AND status = 'completed'
   ORDER BY created_at ASC
   ```
2. 在 proactive engine 注册 3h cron：
   - 查询所有有 undigested 记录的 userId
   - 对每个 userId 的 undigested 记录批量调用 `digestRecords()`
   - BullMQ 优先，setInterval 降级（复用现有模式）

**验收标准**:
- [ ] Cron 每 3 小时触发
- [ ] 正确查出 undigested 记录
- [ ] 批量消化后标记 digested = true
- [ ] 无 undigested 记录时 cron 安静跳过
- [ ] 已被 Process 立即消化的记录不被重复处理

---

## TASK-CE-06: 前端 Strike 轻量展示 + 纠错入口

**复杂度**: M（半天）
**前置**: TASK-CE-02（后端 API）
**涉及文件**:
- `gateway/src/routes/strikes.ts`（新建 REST 路由）
- `features/timeline/components/TimelineCard.tsx`（改造）
- `features/timeline/components/StrikePreview.tsx`（新建）
- `features/timeline/components/StrikeEditor.tsx`（新建）

**具体任务**:
1. 后端 REST API：
   - `GET /api/v1/records/:id/strikes` — 获取某条记录拆解出的 Strike 列表
   - `PATCH /api/v1/strikes/:id` — 用户修改 Strike（nucleus / polarity）
   - `POST /api/v1/strikes/:id/split` — 用户拆分一个 Strike
   - `POST /api/v1/strikes/merge` — 用户合并多个 Strike
2. TimelineCard 改造：
   - 卡片展开后增加一行摘要："认知提取：3 个感知 / 1 个判断 / 1 个意图"
   - 点击摘要行展开 StrikePreview 列表
3. StrikePreview 组件：
   - 显示 Strike 列表（极性图标 + nucleus 文本 + confidence 指示）
   - 极性图标/颜色映射：Perceive 👁️蓝 / Judge ⚖️橙 / Realize 💡紫 / Intend 🎯绿 / Feel ❤️红
4. StrikeEditor 组件：
   - 点击单个 Strike 进入编辑
   - 可修改 nucleus 文本、切换 polarity
   - 保存时 PATCH API，created_by 标记为 "user"

**验收标准**:
- [ ] 已消化记录展示 Strike 摘要行
- [ ] 未消化记录不显示（或显示"待分析"）
- [ ] 点击展开可看到完整 Strike 列表
- [ ] 可编辑 nucleus 和 polarity 并保存
- [ ] 用户修改后 created_by = "user"

---

## 执行顺序

```
CE-01（DB）──→ CE-02（Digest 核心）──→ CE-04（Process 触发）
    │                │                      │
    └── CE-03（检索）─┘                CE-05（Cron 触发）
                     │
                CE-06（前端展示）
```

**可并行**：CE-01 完成后，CE-02 和 CE-03 可并行开发（CE-02 初期可不依赖混合检索，先只用 embedding 通道）。

**建议执行序**：CE-01 → CE-02 + CE-03 并行 → CE-04 → CE-05 → CE-06

---

## Phase 2 / 3 预告（暂不展开）

Phase 2 任务将在 Phase 1 上线验证后拆解，主要包括：
- Level 2 每日聚类 cron
- Cluster 创建 + Promote 机制
- 矛盾检测主动扫描
- Bond 归一化 + strength/salience 衰减

Phase 3 任务：
- Level 3 每周涌现 cron
- Chat mode="decision" 决策分析
- 溯源标注 + 冲突推送
- Digest prompt 自我改进闭环

---

*创建时间：2026-03-19*
*状态：待确认后启动 CE-01*
