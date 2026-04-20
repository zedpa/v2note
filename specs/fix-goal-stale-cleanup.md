---
id: "fix-goal-stale-cleanup"
title: "Fix: 历史低质量目标清理 + 自动化维护"
status: completed
domain: cognitive
risk: medium
dependencies: ["fix-goal-quality.md", "fix-goal-wiki-data-cleanup.md"]
superseded_by: null
backport: goal-lifecycle.md#场景 17.1
created: 2026-04-20
updated: 2026-04-20
---

# Fix: 历史低质量目标清理 + 自动化维护

## 概述

`fix-goal-quality` 修复了增量写入去重，`fix-goal-wiki-data-cleanup`（迁移 067）做了一次性精确文本去重。
但仍有两类问题残留：

1. **语义重复未清理** — "学英语" vs "英语学习"，精确文本匹配抓不到。手动脚本 `repair-goal-dedup.mjs` 存在但从未自动化
2. **空壳目标未清理** — 无子任务的 hollow goals。手动脚本 `repair-goal-cleanup.mjs` Rule 3 存在但无年龄保护（会误伤新建目标），且从未集成到管线
3. **口语化/短期事项误提为目标** — AI wiki-compiler 的 `goal_sync` 将口语化表述（如"今天去买菜""下午开会""好累啊"）错误提取为 level>=1 目标。这些不是长期目标，应降级为普通 todo（level=0）或直接清退
4. **无持续防护** — 每日 3AM 维护（`full-compile-maintenance.ts`）只有 5 阶段，不包含目标质量清理。脏数据会持续积累
5. **cluster_id 残留** — strike 表已被 `064_drop_strike_system.sql` 删除，`todo.cluster_id` 列是孤儿列（ON DELETE SET NULL 已将所有值置 NULL），但代码中仍有 9 个文件引用它

## 1. 一次性存量清理（新迁移）

### 场景 1.1: 空壳目标清退（带年龄保护）
```
假设 (Given)  数据库中存在 level>=1 的目标，无子 todo（无其他 todo 的 parent_id 指向它），创建超过 7 天
当   (When)   执行数据库迁移
那么 (Then)   这些目标标记 done=true, status='dismissed'
并且 (And)    若目标有 wiki_page_id 关联，对应 wiki_page 标记 status='archived'
并且 (And)    创建不满 7 天的空壳目标不受影响（可能是用户刚创建还没添加子任务）
并且 (And)    已有子任务的目标不受影响
```

> 技术说明：
> - todo 表 CHECK 约束只允许 `active|paused|completed|abandoned|progressing|blocked|suggested|dismissed`，不支持 `archived`。空壳目标用 `dismissed` 表示"被系统清退"。
> - 原 `repair-goal-cleanup.mjs` Rule 3 还判断 `cluster_id IS NULL`，但 strike 表已被迁移 064 删除（CASCADE），所有 todo.cluster_id 已为 NULL，该条件永真，无判断意义。本 spec 不再使用 cluster_id 作为判断条件。

### 场景 1.2: 过期 suggested 目标清理
```
假设 (Given)  数据库中存在 status='suggested' 的目标，创建超过 14 天未被用户确认
当   (When)   执行数据库迁移
那么 (Then)   这些目标的状态变为 dismissed，done=true
并且 (And)    关联的 wiki_page 状态变为 archived
```

### 场景 1.3: 精确文本重复兜底
```
假设 (Given)  数据库中仍存在同一用户的多条 level>=1 目标，LOWER(TRIM(text)) 完全相同且均为活跃状态（done=false AND status NOT IN ('completed','abandoned','dismissed')）
当   (When)   执行数据库迁移
那么 (Then)   保留 created_at 最早的一条，其余标记 done=true, status='dismissed'
并且 (And)    被清退目标的子任务（parent_id 指向它们的 todo）迁移到保留目标下
并且 (And)    被清退目标若有 wiki_page_id，将对应 wiki_page 的 wiki_page_record 转移到保留目标的 wiki_page
```

## 2. AI 辅助质量清理（迁移后手动触发一次）

### 场景 2.1: AI 语义去重
```
假设 (Given)  清理后仍有超过 10 条活跃目标
当   (When)   运行语义去重脚本
那么 (Then)   AI 识别语义重复分组（如"健康管理"和"保持健康"）
并且 (And)    每组保留子任务最多的一条，其余标记 done=true, status='dismissed'
并且 (And)    被清退目标的子任务迁移到保留目标下
并且 (And)    保留目标的名称更新为 AI 给出的最佳表述
```

### 场景 2.2: AI 口语化/短期事项降级
```
假设 (Given)  存在 level>=1 的活跃目标，文字为口语化表述或一次性事项
当   (When)   运行目标质量审查脚本
那么 (Then)   AI 逐条判断每个目标是否为"长期目标"
并且 (And)    口语化短期事项（如"今天去买菜""下午开会""好累啊""明天带伞"）降级为 level=0 的普通待办
并且 (And)    情绪表达或非行动项（如"好累啊""最近压力大"）直接标记 done=true, status='dismissed'
并且 (And)    降级/清退前日志输出每条目标的原文 + AI 判断理由，供人工复核
```

> AI 判断标准：
> - **保留为目标**：持续性意图、需多步/多日完成、可衡量进展（如"学英语""减肥""读完三体""完成毕业论文"）
> - **降级为普通待办**：一次性动作、有明确截止点、当天可完成（如"去取快递""买菜""下午开会"）
> - **清退**：情绪表达、感叹、非行动项（如"好累啊""今天好开心""天气真好"）

> 注：场景 2.1 和 2.2 合并到一个脚本 `scripts/repair-goal-quality.mjs`（重构自 `repair-goal-dedup.mjs`），一次 AI 调用同时完成语义去重 + 质量降级。不纳入自动化管线（AI 调用成本高，需人工确认）。

## 3. 每日自动维护（新增阶段 6）

### 场景 3.1: 每日维护自动清理过期 suggested
```
假设 (Given)  每日 3AM 全量维护正在执行
当   (When)   到达阶段 6（目标质量维护）
那么 (Then)   自动将 suggested 超过 14 天的目标标记 done=true, status='dismissed'
并且 (And)    关联 wiki_page 同步标记 status='archived'
并且 (And)    该阶段失败不影响其他阶段正常执行
```

### 场景 3.2: 每日维护自动清理空壳目标
```
假设 (Given)  每日 3AM 全量维护正在执行
当   (When)   到达阶段 6（目标质量维护）
那么 (Then)   自动将无子任务且创建超过 7 天的目标标记 done=true, status='dismissed'
并且 (And)    关联 wiki_page 同步标记 status='archived'
并且 (And)    日志输出清理数量
```

### 场景 3.3: 每日维护精确去重
```
假设 (Given)  每日 3AM 全量维护正在执行
当   (When)   到达阶段 6（目标质量维护）
那么 (Then)   自动合并精确文本重复的活跃目标（保留最早的）
并且 (And)    被归档目标的子任务迁移到保留目标下
```

## 验收行为（E2E 锚点）

> 目标清理为后端维护任务，无直接 UI 操作路径。验收通过单元测试覆盖。

### 行为 1: 迁移后目标数量减少
1. 迁移前统计活跃目标数量
2. 执行迁移
3. 迁移后活跃目标数量应减少（空壳 + 重复 + 过期 suggested 被清理）

### 行为 2: 每日维护包含目标清理
1. 触发 `runFullCompileMaintenance`
2. 返回结果中包含 `stages.goal_quality` 字段
3. 若有可清理目标，`goal_quality` 为 true

## 边界条件
- [ ] 空壳目标刚创建不满 7 天 → 不清理（年龄保护）
- [ ] 目标有子任务 → 不清理（有关联即非空壳）
- [ ] 被清退目标有 wiki_page → page 同步归档
- [ ] suggested 目标仅 13 天 → 不清理（刚好不满 14 天）
- [ ] 重复目标：被归档的那条有子任务 → 子任务迁移到保留目标
- [ ] 维护阶段 6 失败 → 不影响阶段 1-5

## 接口约定

### full-compile-maintenance.ts 扩展
```typescript
// FullMaintenanceResult.stages 新增
goal_quality: boolean;

// 新增 goalQualityStats（日常维护只含硬规则，AI 降级不在此）
goalQualityStats: {
  suggestedDismissed: number;
  hollowDismissed: number;
  duplicatesMerged: number;
};
```

### 新增迁移
```sql
-- supabase/migrations/0XX_goal_stale_cleanup.sql
-- Step 1: 空壳目标（无子任务 + 超 7 天）→ done=true, status='dismissed'
-- Step 2: 过期 suggested（超 14 天）→ done=true, status='dismissed'
-- Step 3: 精确文本重复兜底 → 保留最早，其余 done=true, status='dismissed'
-- 每步同步归档关联 wiki_page
```

### goal-quality-stage.ts（新文件）
```typescript
export interface GoalQualityResult {
  suggestedDismissed: number;
  hollowDismissed: number;
  duplicatesMerged: number;
}

export async function runGoalQualityCleanup(userId: string): Promise<GoalQualityResult>
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `supabase/migrations/0XX_goal_stale_cleanup.sql` | 新增：一次性存量清理 + DROP cluster_id 列 |
| `gateway/src/cognitive/goal-quality-stage.ts` | 新增：目标质量清理逻辑（可复用于日常维护） |
| `gateway/src/cognitive/goal-quality-stage.test.ts` | 新增：单元测试 |
| `gateway/src/cognitive/full-compile-maintenance.ts` | 新增阶段 6：调用 goal-quality-stage |
| `gateway/src/cognitive/full-compile-maintenance.test.ts` | 补充阶段 6 测试 |
| `gateway/src/db/repositories/todo.ts` | 删除 cluster_id 相关字段和 updateClusterRef 方法 |
| `gateway/src/cognitive/goal-auto-link.ts` | 删除 cluster_id 写入逻辑 |
| `gateway/src/cognitive/goal-auto-link.test.ts` | 更新测试 |
| `gateway/src/db/repositories/goal.ts` | 删除 cluster_id 引用 |
| `gateway/src/routes/goals.ts` | 删除 cluster_id 引用 |
| `gateway/src/routes/topics.ts` | 删除 cluster_id 引用 |
| `scripts/repair-goal-cleanup.mjs` | 修复：status 'archived' → 'dismissed'，删除 cluster_id 条件 |
| `scripts/repair-goal-quality.mjs` | 新增：合并语义去重 + 口语化降级（重构自 repair-goal-dedup.mjs） |
| `scripts/repair-goal-dedup.mjs` | 废弃：逻辑合并到 repair-goal-quality.mjs |
| `gateway/src/cognitive/wiki-compile-prompt.ts` | goal_sync 规则增加目标质量门控 |

## 4. 防护：wiki-compile prompt 增加目标质量门控

### 场景 4.1: AI 编译时过滤非目标
```
假设 (Given)  wiki-compiler 正在编译用户的新 Record
当   (When)   AI 判断某条内容可能是目标
那么 (Then)   AI 必须先判断该内容是否为"持续性意图"（需多步/多日完成）
并且 (And)    口语化的一次性事项（"今天买菜""明天开会"）不得创建为 goal_sync.create
并且 (And)    情绪表达（"好累""开心"）不得创建为 goal_sync.create
并且 (And)    这些内容应作为普通 Record 内容归入对应 wiki_page，不提升为目标
```

> 实现方式：在 `wiki-compile-prompt.ts` 的 goal_sync 规则部分追加明确的排除指令和反例。

## 5. cluster_id 残留清理

### 场景 5.1: 删除 todo.cluster_id 孤儿列
```
假设 (Given)  strike 表已被迁移 064 删除，todo.cluster_id 所有值均为 NULL
当   (When)   执行数据库迁移
那么 (Then)   todo 表的 cluster_id 列被删除
并且 (And)    相关索引 idx_todo_cluster 被删除
```

### 场景 5.2: 清理代码中的 cluster_id 引用
```
假设 (Given)  gateway 代码中仍有 9 个文件引用 cluster_id
当   (When)   清理完成
那么 (Then)   所有 cluster_id 引用被移除
并且 (And)    goal-auto-link、goal-linker 等模块不再写入 cluster_id
并且 (And)    todo repo 的 create/updateClusterRef 不再接受 cluster_id 参数
```

## Implementation Phases (实施阶段)
- [x] Phase 1: 新建 `goal-quality-stage.ts` + 单元测试（3 条硬规则的纯逻辑）
- [x] Phase 2: 集成到 `full-compile-maintenance.ts` 阶段 6
- [x] Phase 3: 新建迁移 SQL（目标清理存量 + DROP cluster_id 列）
- [x] Phase 4: 清理代码中所有 cluster_id 引用
- [x] Phase 5: 重构 `repair-goal-dedup.mjs` → `repair-goal-quality.mjs`（合并语义去重 + 口语化降级，一次 AI 调用）
- [x] Phase 6: `wiki-compile-prompt.ts` 增加目标质量门控（排除口语/短期/情绪）

## 备注
- 语义去重（AI 辅助）不纳入自动化管线，成本高且需人工确认，保持手动脚本形式
- 一次性迁移与每日维护使用同一套逻辑（`goal-quality-stage.ts`），避免分裂
- `goal-cleanup-logic.ts`（已有，服务于迁移 067 的测试）可参考但不直接复用——它面向全库批量操作，而 `goal-quality-stage.ts` 是 per-user 的
- Rule 3（空壳目标）必须加 7 天年龄保护，否则用户刚创建的目标会被误清理
- todo 表 CHECK 约束不含 `archived`，所有清退操作统一使用 `done=true, status='dismissed'`
- `repair-goal-cleanup.mjs` 中使用的 `status='archived'` 同样需要修复为 `dismissed`
