---
id: "082"
title: "修复：今日简报 HTTP 500 崩溃"
status: completed
domain: report
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-02
---
# 修复：今日简报 HTTP 500 崩溃

> 状态：✅ 已完成

## 概述
今日简报（晨间简报 + 晚间总结）对所有用户返回 HTTP 500，功能完全不可用。根因有两层：
1. 前端绕过 api.ts 直接 fetch，缺少 Authorization header
2. gateway 中 `scheduled_start` 字段是 Date 对象而非字符串，调用 `.startsWith()` 抛出 TypeError

## 根因分析

### 直接原因：Date 类型不匹配
gateway/src/handlers/daily-loop.ts:106
```typescript
const todayScheduled = pendingTodos.filter((t) =>
  t.scheduled_start?.startsWith(today),  // TypeError: startsWith is not a function
);
```
PostgreSQL `pg` 驱动对 `timestamp/timestamptz` 列返回 JS `Date` 对象，不是字符串。
`Todo.scheduled_start` 类型声明为 `string | null`，但运行时实际是 `Date | null`。

### 底层问题：缺少 Authorization header
features/daily/hooks/use-daily-briefing.ts 所有 3 个 fetch 调用都绕过 `api.ts`：
- Line 56: `fetch(briefing)` — 只发 `X-Device-Id`
- Line 88: `fetch(evening-summary)` — 只发 `X-Device-Id`
- Line 111: `fetch(relays/PATCH)` — 只发 `X-Device-Id`

### 同类问题扫描
features/chat/components/counselor-chat.tsx:118 也绕过 api.ts，无 Authorization header。
其余 features/ 下的 API 调用均正确使用 `api.ts`（grep 确认）。

## 场景

### 场景 1: 晨间简报正常加载
```
假设 (Given)  用户已登录，有若干待办（含已排期和未排期）
当   (When)   用户打开今日简报
那么 (Then)   简报显示问候语、今日待办列表、目标进展、AI 建议
并且 (And)    scheduled_start 为 Date 或 string 类型均能正确筛选今日待办
```

### 场景 2: 晚间总结正常加载
```
假设 (Given)  用户已登录，当天有已完成和未完成的待办
当   (When)   用户打开晚间总结
那么 (Then)   总结显示今日成就、认知亮点、目标更新、明日预览
```

### 场景 3: Relay 标记完成
```
假设 (Given)  简报中有 relay 待办
当   (When)   用户点击 relay 的完成按钮
那么 (Then)   API 调用成功，按钮状态更新为已完成
并且 (And)    失败时显示错误提示，按钮恢复可点击
```

### 场景 4: 新用户无待办时的简报
```
假设 (Given)  新注册用户，无任何待办或笔记
当   (When)   系统自动弹出今日简报
那么 (Then)   显示友好的空状态：问候语 + "今天开始记录你的第一个想法吧"
并且 (And)    不显示空的待办列表和目标卡片
```

### 场景 5: Auth token 过期时的降级
```
假设 (Given)  用户 token 已过期
当   (When)   简报请求返回 401
那么 (Then)   自动 refresh token 并重试
并且 (And)    refresh 失败时显示"登录已过期"提示
```

## 边界条件
- [x] scheduled_start 为 null → 归入"未排期"组（已处理）
- [ ] scheduled_start 为 Date 对象 → 应转为 ISO string 再比较
- [ ] scheduled_start 为 ISO string → 直接 startsWith 比较
- [ ] 无网络 → 显示"加载失败"+ 重试按钮（已有）
- [ ] gateway 未启动 → 显示"连接失败"（已有）
- [ ] 空待办/空目标 → 简报应跳过空卡片

## 修复方案

### Fix 1: gateway — Date 类型安全处理（根治）
```typescript
// gateway/src/handlers/daily-loop.ts
const toDateStr = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
};

const todayScheduled = pendingTodos.filter((t) =>
  toDateStr(t.scheduled_start)?.startsWith(today),
);
```

### Fix 2: 前端 — 改用 api.ts（根治 auth 问题）
```typescript
// features/daily/hooks/use-daily-briefing.ts
import { api } from "@/shared/lib/api";

const fetchBriefing = useCallback(async (forceRefresh?: boolean) => {
  const qs = forceRefresh ? "?refresh=true" : "";
  const data = await api.get<BriefingResult>(`/api/v1/daily/briefing${qs}`);
  setBriefing(data);
}, []);
```

### Fix 3: counselor-chat.tsx 同步修复
Line 118 的 fetch 也需改用 api.ts。

## 影响范围
- features/daily/hooks/use-daily-briefing.ts（3 处 fetch）
- features/chat/components/counselor-chat.tsx（1 处 fetch）
- gateway/src/handlers/daily-loop.ts（2 处 startsWith）

## 依赖
- shared/lib/api.ts — 已有 auth header 注入和 401 自动 refresh
- gateway/src/db/repositories/todo.ts — scheduled_start 类型需统一
