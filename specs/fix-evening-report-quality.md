---
id: "fix-evening-report-quality"
title: "Fix: 晚间总结路径统一 + 明日预览数据错误"
status: completed
backport: daily-report-core.md#场景 E5
domain: report
risk: medium
dependencies: ["daily-report-extended.md"]
superseded_by: null
created: 2026-04-16
updated: 2026-04-16
---

# Fix: 晚间总结路径统一 + 明日预览数据错误

## 概述
前端存在两条晚报路径，其中 `SmartDailyReport`（命令面板"晚间总结"）走 legacy `report.ts`，将全量 pending 待办（不分日期）标记为 `todayPending` 喂给 AI，导致 AI 在 `tomorrow_preview` 中选出已完成/不相关的待办。应统一到 v2 路径 `daily-loop.ts`，同时清理死代码。

## Bug 现象
- 用户看到晚间总结"明天要做的事"中包含今天已经完成的待办
- 两条晚报路径返回不同格式的数据，UI 体验不一致

## 根因

### 路径分裂
| 组件 | API | Handler | 问题 |
|------|-----|---------|------|
| `EveningSummary` | `/api/v1/daily/evening-summary` | `daily-loop.ts: generateEveningSummary()` | ✅ 正确 |
| `SmartDailyReport` | `/api/v1/report?mode=auto` | `report.ts: generateEveningReport()` | ❌ 数据错误 |

### legacy `report.ts` 的具体问题
1. `pendingTodos.slice(0, 5)` 取全量 pending（不分日期），标记为 `{todayPending}`
2. AI prompt 中无显式 `tomorrowScheduled` 数据，AI 从 "todayPending" 猜明日预览
3. 返回格式缺少 v2 的 `insight`/`affirmation` 字段

### 死代码
- `gateway/src/prompts/evening.md` — 无任何代码引用
- `gateway/src/prompts/morning.md` — 无任何代码引用
- `gateway/src/prompts/perspectives.md` — 仅被 evening.md 引用（同为死代码）

## 修复方案

### 场景 1: 命令面板晚间总结入口统一
```
假设 (Given)  用户通过命令面板打开"晚间总结"
当   (When)   用户点击"晚间总结"
那么 (Then)   页面显示统一的晚间总结内容
并且 (And)    内容中包含今日亮点与每日肯定字段
```

### 场景 2: 明日预览只包含明日排期的待办
```
假设 (Given)  用户有 3 个未完成待办（1 个排明天，2 个无排期）
并且 (And)    用户今天完成了 2 个待办
当   (When)   用户打开晚间总结
那么 (Then)   "明天"区域只显示那 1 个排明天的待办
并且 (And)    已完成待办不出现在"明天"区域
并且 (And)    无排期的待办不出现在"明天"区域
```

### 场景 3: 任何晚间入口返回相同结构
```
假设 (Given)  用户通过侧边栏"日报"或命令面板"晚间总结"进入
当   (When)   用户打开晚间视图
那么 (Then)   两个入口显示相同的内容结构
并且 (And)    明日预览均只含明日排期的待办
```

## 验收行为（E2E 锚点）

### 行为 1: 命令面板晚间总结显示正确明日预览
1. 用户完成若干待办
2. 用户有 1 个排明天的待办 "明天开会"
3. 用户打开命令面板 → 点击"晚间总结"
4. 页面显示"明天"区域只有"明天开会"，不包含今天已完成的待办

## 边界条件
- [x] 无明日排期 → tomorrow_preview 空数组
- [x] 用户无待办 → accomplishments 空数组，headline 接纳语气
- [x] legacy API 调用方兼容

## 接口约定

### 修改 1: `SmartDailyReport` 改用 v2 evening 路径
当 mode=evening 时，直接调用 `/api/v1/daily/evening-summary`。

### 修改 2: `report.ts` generateReport evening 分支代理到 v2
```typescript
case "evening":
  return generateEveningSummary(deviceId, userId);
```

### 修改 3: 清理死代码
删除 `gateway/src/prompts/evening.md`、`morning.md`、`perspectives.md`。

## Implementation Phases
- [ ] Phase 1: report.ts evening 分支代理到 generateEveningSummary
- [ ] Phase 2: SmartDailyReport 前端路径统一
- [ ] Phase 3: 清理死代码 prompts
