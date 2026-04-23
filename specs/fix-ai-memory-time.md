---
id: fix-ai-memory-time
title: "Fix: AI 记忆时间错乱（分不清昨天/今天）"
status: completed
backport: chat-persistence.md#场景 7.3
domain: cognitive
risk: medium
dependencies: []
created: 2026-04-08
updated: 2026-04-08
---

# Fix: AI 记忆时间错乱

## Bug 现象

用户和 AI 聊天时，AI 无法正确区分一件事发生在"昨天"还是"今天"。例如用户今天录了一条日记，AI 在回顾时可能说成"昨天你提到…"，或反过来。

## 根因分析

### 问题 0: 历史消息恢复时无时间戳（最关键）

`chat.ts:312-319` 恢复最近 20 条对话消息时，只注入 `role` 和 `content`，**完全丢弃 `created_at`**。AI 看到 20 条跨天的历史消息，全部混在一起，无法区分哪条是今天的、哪条是昨天的——这是时间错乱的**主因**。

```typescript
// 当前代码（chat.ts L315-318）
for (const msg of recentMessages.reverse()) {
  if (msg.role === "user" || msg.role === "assistant") {
    session.context.addMessage({ role: msg.role, content: msg.content }); // ← 无时间信息
  }
}
```

### 问题 1: 日期格式不统一 → AI 难以比对

AI system prompt 中存在三种日期格式，AI 需要跨格式比对才能判断时间关系：

| 上下文来源 | 格式 | 示例 |
|-----------|------|------|
| 时间锚点表 | ISO | `2026-04-08` |
| 日记/记录 | zh-CN locale | `2026/4/8` |
| Memory | ISO 或 null | `[2026-04-08]` 或 `[未知日期]` |
| 待办 | zh-CN locale | `(2026年4月8日)` |

**位置**：
- `chat.ts:205` — `toLocaleDateString("zh-CN")` → "2026/4/8"
- `chat.ts:261` — pending intents 同样
- `chat.ts:359` — sendChatMessage 中的转录同样
- `chat.ts:380` — 待办的 scheduled_start 同样
- `context/loader.ts:72` — memory 用 `source_date`（ISO）

### 问题 2: 缺少相对时间标记

记录注入格式为 `[2026/4/8] 今天开了个会...`，AI 看到日期但不直观知道这是"今天"还是"昨天"。虽然有时间锚点表可以查，但 AI 在处理大量上下文时容易出错。

### 问题 3: 时区不同步

- `buildDateAnchor()` 用 `new Date()`（gateway 服务器时间）
- 前端 `dateRange` 用 `new Date().toISOString().split("T")[0]`（可能因 UTC 转换差一天）
- 数据库查询用 `now()`（数据库服务器时间）

三者可能不在同一时区，导致"今天"的定义不一致。

## 1. 历史消息注入日期分隔

### 场景 1.1: 用户询问今天的事 AI 不混入昨天内容
```
假设 (Given)  用户昨天录了一条关于会议的内容、今天录了一条关于购物的内容
当   (When)   用户打开聊天询问"我今天做了什么"
那么 (Then)   AI 回复中仅出现今天的购物内容
并且 (And)    AI 回复中不出现昨天的会议内容
```

### 场景 1.2: 用户询问昨天的事 AI 正确回忆
```
假设 (Given)  用户昨天录了一条关于会议的内容
当   (When)   用户切换话题询问"那昨天呢"
那么 (Then)   AI 回复中出现昨天的会议内容
并且 (And)    AI 不将昨天的内容描述为今天发生
```

### 场景 1.3: 用户引用今日日记时 AI 措辞正确
```
假设 (Given)  用户今天录入了一条日记
当   (When)   用户提交聊天内容引用该日记
那么 (Then)   AI 回复措辞为"今天你提到…"
并且 (And)    AI 不会误称为"昨天"
```

### 场景 1.4: 跨午夜录入的记录归属正确
```
假设 (Given)  用户昨天 23:55 录入了一条记录
当   (When)   用户今天 00:05 打开聊天询问昨天做了什么
那么 (Then)   AI 回复将该记录归入昨天
并且 (And)    不将其误归为今天
```

## 验收行为（E2E 锚点）

### 行为 1: AI 正确区分今天和昨天的记录
1. 用户昨天录了"和张总开会"
2. 用户今天录了"去超市买菜"
3. 用户问 AI"我今天做了什么"
4. AI 应回答包含"买菜"，不应混入"张总开会"
5. 用户问"昨天呢"
6. AI 应回答"张总开会"

### 行为 2: AI 引用记录时使用正确时间
1. 用户今天录了一条日记
2. 用户和 AI 聊天
3. AI 引用该记录时说"今天你提到…"，而非"昨天"

## 边界条件
- [ ] 跨午夜：23:55 录入的记录，在 00:05 查看时应属于"昨天"
- [ ] 无记录的日期：AI 应说"那天没有记录"
- [ ] 用户时区 vs 服务器时区差异（UTC+8 用户，UTC 服务器）
- [ ] Memory source_date 为 null 的老数据

## 4. read_diary 工具

> read_diary 工具的完整定义和实现在 `fix-agent-tool-behavior.md` 中统一管理，
> 此处仅记录本 spec 的依赖关系：AI 时间感知修复依赖 read_diary 工具的存在，
> 使得 AI 在用户提及某天时可按需加载该日完整日记。

## 修复方案

### 改动 0（主因修复）: chat.ts 历史消息注入日期分隔
- L312-319：遍历 `recentMessages` 时，检测 `created_at` 日期变化
- 日期切换时插入 `{ role: "system", content: "[以下是 YYYY-MM-DD 今天/昨天 的对话]" }`
- 使用 `formatDateWithRelative()` 生成标记

### 改动 1: 统一日期格式化工具函数
- 在 `date-anchor.ts` 新增 `formatDateWithRelative(date: Date, today: Date): string`
- 输出：`2026-04-08 今天` / `2026-04-07 昨天` / `2026-04-06`
- 复用已有 `fmt()` 函数
- 所有 `toLocaleDateString("zh-CN")` 替换为 ISO 格式
- 涉及文件：`chat.ts`（4处）、`todo.ts`（1处）、`cognitive/decision.ts`（1处）

### 改动 2: 前端传递时区 + gateway 使用
- 前端 `chat.start` payload 增加 `timezone: Intl.DateTimeFormat().resolvedOptions().timeZone`
- `buildDateAnchor()` 签名改为 `buildDateAnchor(referenceDate?: Date, timezone?: string)`
- chat.ts `initChat()` 将时区传递给 `buildDateAnchor()`

### 改动 3: context/loader.ts memory 格式化
- `source_date` 有值时添加相对标记

## 依赖
- gateway/src/lib/date-anchor.ts
- gateway/src/handlers/chat.ts
- gateway/src/context/loader.ts
- gateway/src/memory/manager.ts
- features/chat/lib/gateway-client.ts（前端 payload）
- fix-agent-tool-behavior.md（read_diary 工具）

## Implementation Phases
- [ ] Phase 1: 创建 `formatDateWithRelative()` + 历史消息日期分隔（主因修复）
- [ ] Phase 2: 替换所有 `toLocaleDateString("zh-CN")` 为 ISO + 相对标记
- [ ] Phase 3: 前端传递时区，gateway 使用
- [ ] Phase 4: 单元测试

## 备注
- `toLocaleDateString("zh-CN")` 在 Node.js 中输出格式取决于 ICU 数据，不同环境可能不一致
- 相对标记只加"今天"和"昨天"，更远的日期用绝对 ISO 即可，避免过度标注
- 时区传递是根治方案，但即使不做时区同步，统一格式 + 相对标记已能大幅改善
