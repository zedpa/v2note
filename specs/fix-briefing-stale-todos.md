---
id: fix-briefing-stale-todos
title: "Fix: 早晚报待办过时 + 数据范围修正"
status: completed
domain: report
risk: medium
dependencies: ["daily-report-core.md", "daily-report-extended.md"]
superseded_by: null
created: 2026-04-12
updated: 2026-04-12
---

# Fix: 早晚报待办过时 + 数据范围修正

## Bug 现象

1. **早报引用过时待办**：早报展示的待办列表包含了大量与今天无关的古早待办（如两周前创建但无排期的待办），用户看到的是一堆积压而非"今天要做什么"
2. **早报应聚焦当天**：早报的核心价值是"今天要做什么"，应只展示今日排期 + 逾期，不应把全量未完成待办塞进去
3. **晚报缺少日记亮点**：晚报的 insight 只基于 transcript 原文，缺少对"今天新创建的日记内容"的结构化传递，AI 难以提取有价值的亮点

## 根因分析

### 问题 1: 早报传入全量未完成待办
**文件**: `gateway/src/handlers/daily-loop.ts` (lines 114-176)

```typescript
// 当前：获取全量 pending，然后 prioritize
const pendingTodos = await todoRepo.findPendingByUser(userId);
// todayScheduled 和 overdue 过滤后，剩余的全量 pending 也被塞进去：
const prioritizedTodos = [
  ...todayScheduled,
  ...overdue.filter(...),
  ...pendingTodos.filter(...)  // ← 这里把所有古早待办都带上了
    .sort((a, b) => ...)
].slice(0, 10);
```

AI prompt 的 user message 传了 `待办(${pendingTodos.length}):`，AI 看到了与今天无关的大量待办。

### 问题 2: 晚报日记传递不够结构化
**文件**: `gateway/src/handlers/daily-loop.ts` (lines 326-391)

晚报的 user message 只传了：
- `今日完成(N): 待办1、待办2`
- `今日记录: N 条`（只有数量！）
- `今日日记: [原始 transcript]`

缺少日记的条目级信息（标题/摘要），AI 只能从原始 transcript 中猜测亮点。

## 修复方案

### Fix A: 早报只传今日相关待办
**文件**: `gateway/src/handlers/daily-loop.ts`

1. 早报的 `prioritizedTodos` 只包含：
   - 今日排期（`toLocalDateStr(scheduled_start) === today`）
   - 逾期待办（`toLocalDateStr(scheduled_end) < today`，日期级比较，非时间戳级）
   - 过期未完成（`toLocalDateStr(scheduled_start) < today`，排了过去日期但没完成的，归入 carry_over）
   - **移除**"其他全量 pending"的 fallback（无排期的待办不出现在早报中）
2. user message 中移除 `待办(${pendingTodos.length}):` 全量计数，改为 `今日待办(${todayScheduled.length}):`
3. 如果今日排期 + 逾期 = 0，传一句"今天没有排期的待办"
4. fallback 路径（AI 调用失败时）也使用相同的过滤逻辑
5. 截断优先级：今日排期优先，逾期其次，总计不超过 10 条

### Fix B: 晚报增加日记条目摘要 + 亮点引导
**文件**: `gateway/src/handlers/daily-loop.ts`

1. 在 user message 中，除了 transcript 原文，增加今日日记的条目级信息：
   - 每条日记的创建时间（本地时间 HH:mm）+ 前 100 字摘要（来自 transcript.text 截断）
2. 增强 prompt 引导：让 AI 从今日活动（完成的待办 + 日记内容）中提取"亮点"
3. `insight` 字段语义调整为"今日亮点"（prompt 层面，不改字段名）
4. 日记内容截断策略不变（已有 2000 字限制）

## 场景

### 1. 早报只展示今日相关待办

#### 场景 1.1: 用户有今日排期待办 → 只展示今日排期
```
假设 (Given)  用户有 3 个今日排期待办，5 个无排期的古早待办
当   (When)   系统生成早报
那么 (Then)   早报的 today_focus 只包含今日排期的 3 个待办
并且 (And)    不包含无排期的古早待办
```

#### 场景 1.2: 用户有逾期待办 → carry_over 展示逾期
```
假设 (Given)  用户有 2 个逾期待办（scheduled_end 日期 < today）
当   (When)   系统生成早报
那么 (Then)   carry_over 展示这 2 个逾期待办
并且 (And)    today_focus 不包含逾期待办（避免重复）
```

#### 场景 1.3: 用户有过去排期但未完成的待办 → 归入 carry_over
```
假设 (Given)  用户有 1 个待办 scheduled_start=3天前，无 scheduled_end，未完成
当   (When)   系统生成早报
那么 (Then)   该待办出现在 carry_over 中（因为排期日期已过）
并且 (And)    不出现在 today_focus 中
```

#### 场景 1.4: 用户今天没有排期也没有逾期 → 空列表
```
假设 (Given)  用户有 5 个未完成待办，但都无排期且未逾期
当   (When)   系统生成早报
那么 (Then)   today_focus 为空数组
并且 (And)    carry_over 为空数组
并且 (And)    AI 不会编造不存在的待办
```

### 2. 晚报展示今日已完成 + 日记亮点

#### 场景 2.1: 用户今天完成了待办 + 写了日记 → 亮点提取
```
假设 (Given)  用户今天完成了 3 个待办，写了 2 条日记
当   (When)   系统生成晚报
那么 (Then)   accomplishments 包含今日完成的待办
并且 (And)    insight 包含基于日记内容的亮点分析
并且 (And)    stats.done = 3, stats.new_records = 2
```

#### 场景 2.2: 用户今天只完成待办没写日记 → insight 为空
```
假设 (Given)  用户今天完成了 2 个待办，没有写日记
当   (When)   系统生成晚报
那么 (Then)   accomplishments 包含 2 个待办
并且 (And)    insight 为空字符串
```

#### 场景 2.3: 用户今天什么都没做 → 温暖的空报告
```
假设 (Given)  用户今天没完成待办也没写日记
当   (When)   系统生成晚报
那么 (Then)   accomplishments 为空数组
并且 (And)    headline 是温暖的接纳性语句（非公文腔）
```

## 验收行为（E2E 锚点）

> 早晚报涉及 AI 调用 + 时间相关逻辑，以单元测试为主。

### 行为 1: 早报只含今日待办
1. mock 用户有今日排期 2 个 + 无排期古早待办 5 个
2. 调用 `generateMorningBriefing`
3. AI 收到的 user message 中只应包含今日排期的 2 个待办
4. 不应包含无排期的 5 个古早待办

### 行为 2: 晚报包含日记摘要
1. mock 用户今天完成 2 个待办 + 写了 1 条日记
2. 调用 `generateEveningSummary`
3. AI 收到的 user message 中应包含日记内容摘要
4. 生成的 insight 字段应非空

## 边界条件
- [x] 早报: 今日 0 个排期、0 个逾期 → today_focus=[], carry_over=[]
- [x] 早报: 排期 + 逾期总数超过 10 → 截取前 10
- [x] 晚报: 今日 0 个完成、0 条日记 → 温暖的空报告
- [x] 晚报: 日记文本超长 → 截断到 2000 字（已有逻辑）
- [x] 缓存: forceRefresh=true 时应绕过缓存生成新报告

## 接口约定

### BriefingResult（不变）
```typescript
interface BriefingResult {
  greeting: string;
  today_focus: string[];      // 只含今日排期的待办
  carry_over: string[];       // 逾期待办
  goal_pulse: Array<{ title: string; progress: string }>;
  stats: { yesterday_done: number; yesterday_total: number };
}
```

### SummaryResult（不变）
```typescript
interface SummaryResult {
  headline: string;
  accomplishments: string[];  // 今日完成的待办
  insight: string;            // 今日亮点（基于日记 + 活动）
  affirmation: string;
  tomorrow_preview: string[];
  stats: { done: number; new_records: number };
}
```

## Implementation Phases
- [ ] Phase 1: 早报 — 移除全量 pending fallback，只传今日排期 + 逾期
- [ ] Phase 2: 晚报 — user message 增加日记条目摘要，增强亮点引导 prompt
- [ ] Phase 3: 单元测试覆盖新逻辑

## 涉及文件
- `gateway/src/handlers/daily-loop.ts` — 核心修改
- `gateway/src/handlers/daily-loop.test.ts` — 新增/更新测试
