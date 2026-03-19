# ACTIVE_TASKS.md — 认知引擎 Phase 3 执行方案

> Phase 1 + Phase 2 已完成。
> Phase 3 目标：高阶涌现 + 决策输出 + 认知统计

---

## TASK-CE-13: Level 3 每周涌现引擎

**复杂度**: L
**涉及文件**: `gateway/src/cognitive/emergence.ts`（新建）

1. 扫描 cluster 间的 bond → 发现更高阶结构（cluster 的 cluster）
2. 检测 cluster 演化（成员数增长/萎缩/分裂/合并）
3. 发现 resonance：表面不同但深层相关的 cluster
4. 提炼认知模式（用户反复出现的决策风格）
5. 注册每周 cron（周日凌晨 4 点）

---

## TASK-CE-14: 决策分析模式（chat mode="decision"）

**复杂度**: L
**涉及文件**: `gateway/src/handlers/chat.ts`（改造）, `gateway/src/cognitive/decision.ts`（新建）

1. chat.ts 新增 mode="decision" 分支
2. 输入：用户的决策问题（"帮我想想要不要换供应商"）
3. 深度语义召回：跨全时间线，不限日期范围，用 hybridRetrieve 全通道
4. 组装 prompt：召回的 Strike + cluster + 用户认知模式 → AI 分析
5. 输出要求：每个论据标注来源 Strike ID

---

## TASK-CE-15: 溯源标注（Strike ID → 原始记录）

**复杂度**: M
**涉及文件**: `gateway/src/routes/strikes.ts`（扩展）, 前端组件（改造）

1. API：GET /api/v1/strikes/:id/trace — 返回 Strike 的完整溯源链（source record + bond 链 + cluster）
2. 前端：Strike 点击后可跳转到原始记录

---

## TASK-CE-16: 冲突检测 + 主动推送

**复杂度**: M
**涉及文件**: `gateway/src/cognitive/alerts.ts`（新建）, `gateway/src/proactive/engine.ts`（改造）

1. 从 contradiction bond 生成用户可读的冲突描述
2. 通过 proactive engine 推送给用户（WebSocket）
3. 推送格式：两个矛盾 Strike 的 nucleus + 解释

---

## TASK-CE-17: 认知统计 API

**复杂度**: M
**涉及文件**: `gateway/src/routes/cognitive-stats.ts`（新建）, 前端（可选）

1. GET /api/v1/cognitive/stats — 返回：
   - 极性分布（perceive/judge/realize/intend/feel 各多少）
   - Realize 平均滞后天数（从 Perceive 到 Realize 的平均时间）
   - 共振键最强的领域（resonance bond 最密集的 cluster）
   - 活跃 cluster 数量 + top-5 cluster 名称
   - 矛盾数量

---

## 执行顺序

```
CE-17（统计，独立）
CE-15（溯源，独立）
CE-16（冲突推送，独立）
CE-13（涌现引擎）
CE-14（决策模式，依赖 CE-13 的认知模式 + CE-15 的溯源）
```

建议：CE-17 + CE-15 + CE-16 并行 → CE-13 → CE-14
