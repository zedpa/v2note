---
id: fix-morning-briefing
title: "Fix: 早报时区错位 + 问候语风格与字数"
status: completed
backport: daily-report-core.md#场景 M4
domain: report
risk: medium
dependencies: ["daily-report-core.md"]
created: 2026-04-08
updated: 2026-04-08
---

# Fix: 早报时区错位 + 问候语风格与字数

## Bug 现象

1. **当日早报返回昨日缓存**：7:30 推送早报后，用户看到的是昨天的简报内容（昨天下午缓存的结果）
2. **问候语基于待办而非画像**：晨间问候风格由待办数据驱动，缺乏人格化；且 ≤15 字硬限使 AI 只能生成"早上好，4月8日"级别的干燥问候

## 根因分析

### 问题 1: UTC 时区错位导致缓存命中昨日数据

**当前代码** (`daily-loop.ts:46`):
```typescript
const today = new Date().toISOString().split("T")[0];
```

`toISOString()` 返回 UTC 日期。服务器在 UTC+8，早上 7:30 北京时间 = 前一天 23:30 UTC。

**复现路径（与 fix-daily-report-notify 的交互）**:
1. 4月7日 7:30 AM BJ (4月6日 23:30 UTC): BullMQ 触发晨报预生成 → `today` = "2026-04-06"(UTC) → 生成并缓存 (userId, "2026-04-06", "morning")
2. 4月7日 下午 2:00 BJ (4月7日 06:00 UTC): 用户手动打开简报 → `today` = "2026-04-07"(UTC) → 无缓存 → 重新生成并缓存 (userId, "2026-04-07", "morning")
3. 4月8日 7:30 AM BJ (4月7日 23:30 UTC): BullMQ 再次触发 → `today` = "2026-04-07"(UTC) → **命中第2步缓存** → 返回昨天的简报

注：`fix-daily-report-notify` 引入的预生成逻辑使缓存命中率更高，从而让 UTC bug 的影响变得更加确定和可复现。

**影响范围（本 fix 修改范围）**:
- `daily-loop.ts`: `generateMorningBriefing` 和 `generateEveningSummary` 中 4 处 `toISOString().split("T")[0]`
- `engine.ts`: `handleTimedPush` evening 分支中 1 处（`regenerateSummary` 日期参数）、fallback `checkDevice` 中 1 处（nudgeKey 去重键）

**已知未修范围（tech debt，不在本 fix 内）**:
gateway 中还有 20+ 处 `toISOString().split("T")[0]` 调用（如 `digest.ts`、`daily-cycle.ts`、`chat.ts`），其中大部分在下午/晚间运行时 UTC 与本地一致。如需全量治理应另建 spec。

### 问题 2: prompt 框架错误 + 字数过紧

**当前 prompt** (`daily-loop.ts:102`):
```
根据待办数据生成个性化晨间问候。
"greeting": "≤15字，自然口语问候，包含日期，结合用户画像个性化"
```

两个问题:
- "根据待办数据" → AI 会围绕待办生成问候（"你今天有5件事要做！"），而非基于用户人格画像（soul）生成有温度的问候
- ≤15 字中文约束：扣除"早上好"(3字)+"4月8日"(4字)+逗号(1字)=8字，只剩7字空间，AI 根本无法表达任何个性化内容

## 1. 日期计算统一使用本地日期

### 场景 1.1: 早上 7:30 推送使用正确的本地日期
```
假设 (Given)  用户所在本地时间为 4月8日 7:30
当   (When)   系统到达早报推送时间
那么 (Then)   用户收到的早报内容对应本地日期 4月8日
并且 (And)    不会看到前一天（4月7日）的缓存内容
```

### 场景 1.2: 晚上 8:00 推送不受影响
```
假设 (Given)  当前本地时间 4月8日 20:00
当   (When)   系统到达晚报推送时间
那么 (Then)   用户收到 4月8日当天的晚报内容，行为与以前一致
```

### 场景 1.3: 手动刷新始终返回当日新鲜内容
```
假设 (Given)  用户在 4月8日 8:00 AM 打开简报页面
当   (When)   用户打开简报页
那么 (Then)   页面显示当天（4月8日）最新内容
并且 (And)    如无缓存则生成新的当日简报
```

### 场景 1.4: 凌晨时段手动刷新仍使用正确日期
```
假设 (Given)  用户在 4月8日 0:30 AM 查看简报
当   (When)   用户刷新简报
那么 (Then)   页面显示 4月8日的新内容
并且 (And)    昨日统计对应 4月7日，不出现错位
```

### 场景 1.5: 晚报推送日期与生成保持一致
```
假设 (Given)  当前本地时间 4月8日 20:00
当   (When)   系统到达晚报推送时间
那么 (Then)   用户看到的晚报与推送时间对应同一个本地日期
并且 (And)    晚报统计与明日预览的日期锚点保持一致
```

### 修复方案

将 `daily-loop.ts` 中所有日期计算从 `toISOString()` (UTC) 改为使用 `date-anchor.ts` 中已有的 `fmt()` 函数（基于本地时间 `getFullYear/getMonth/getDate`）：

```typescript
// Before (UTC, 时区错位)
const today = new Date().toISOString().split("T")[0];
const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

// After (本地时间，与用户感知一致)
import { fmt } from "../lib/date-anchor.js";
const now = new Date();
const today = fmt(now);
const yesterdayDate = new Date(now);
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterday = fmt(yesterdayDate);
```

`fmt()` 已在 `date-anchor.ts:6-12` 中定义，使用 `getFullYear()/getMonth()/getDate()` 获取本地日期，正是为了避免 UTC 偏移问题（注释已说明）。yesterday 使用 `setDate` 而非 `86400000ms` 硬编码，与 `date-anchor.ts` 中的 `addDays()` 模式一致，夏令时安全。

**部署约束**: `fmt()` 依赖服务器进程时区。当前项目部署环境需设置 `TZ=Asia/Shanghai`。如在 UTC 容器中运行，`fmt()` 退化为 UTC 日期，fix 无效。

## 2. 问候语基于 Soul/Profile + 放宽字数

### 场景 2.1: 问候语由 soul 和 profile 驱动
```
假设 (Given)  用户有 soul（"喜欢简洁务实的沟通"）和 profile（"产品经理，关注效率"）
当   (When)   用户打开晨间简报
那么 (Then)   问候语体现用户人格特征，呈现个性化表达
并且 (And)    问候语不以待办数量或内容作为主题
并且 (And)    问候语风格与 soul 描述保持一致
```

### 场景 2.2: 无 soul/profile 时降级为通用问候
```
假设 (Given)  新用户没有 soul 和 profile
当   (When)   用户打开晨间简报
那么 (Then)   问候语为温暖的通用问候，包含日期与一句轻松的话
并且 (And)    不出现"你今天有 N 件事"类措辞
```

### 场景 2.3: 字数放宽到 30 字以内
```
假设 (Given)  用户打开晨间简报
当   (When)   用户查看问候区域
那么 (Then)   问候长度不超过 30 个中文字符
并且 (And)    内容自然流畅，不影响页面排版
```

### 修复方案

1. prompt 主语从"根据待办数据"改为"根据用户画像"
2. soul/profile 从附加 hint 提升为 prompt 主体
3. greeting 字数限制从 ≤15 放宽到 ≤30
4. 明确指示：问候不要提待办数量

```
根据用户画像生成个性化晨间问候。返回纯 JSON，不要 markdown 包裹。

<user_soul>{soul}</user_soul>
<user_profile>{profile}</user_profile>

{
  "greeting": "≤30字，基于用户画像的个性化问候，包含日期，语气自然温暖。不要提待办数量。",
  "today_focus": [...],
  ...
}
```

## 验收行为（E2E 锚点）

### 行为 1: 早报推送返回当日新鲜内容
1. 系统在 7:30 AM 触发早报推送
2. 用户收到推送后打开简报页
3. 简报内容反映**今天**的待办和统计数据，不是昨天的
4. greeting 中包含今天的日期

### 行为 2: 问候语体现用户画像
1. 用户（有 soul/profile）打开晨间简报
2. greeting 是有温度的个性化问候（非"早上好，你今天有5件事"）
3. greeting 长度在 15-30 字之间，自然流畅
4. 问候风格与用户 soul 一致

## 边界条件
- [ ] 跨午夜推送：23:59 生成的报告不应在次日 7:30 被缓存命中
- [ ] 服务器重启后首次推送：应生成新内容而非返回空
- [ ] soul/profile 均为空：降级为通用问候，不报错
- [ ] soul 内容过长：截断到 200 字注入 prompt（已有逻辑）
- [ ] greeting 超出 30 字：前端 UI 应兼容截断显示
- [ ] 服务器时区非 UTC+8：`fmt()` 依赖 `TZ` 环境变量，需在部署配置中保证
- [ ] engine.ts fallback checkDevice 中的日期也需改用 `fmt()`

## 字段说明

`BriefingResult.greeting` 是 daily-loop 简化版的晨间问候字段，与 `daily-report-core.md` 中 `MorningReport`（继承 `ReportBase`）的 `headline` 是不同字段。greeting 专用于问候语，headline 用于内容摘要。两者字数限制独立：greeting ≤30字，headline ≤25-35字。后续如果统一 schema，需要同时保留两个字段。

## 依赖
- `gateway/src/handlers/daily-loop.ts` — 主修改文件（日期 4 处 + prompt 重写）
- `gateway/src/lib/date-anchor.ts` — 复用 `fmt()` 函数
- `gateway/src/proactive/engine.ts` — evening 分支 1 处日期 + fallback checkDevice 1 处日期
- `gateway/src/prompts/templates.ts` — 模板同步更新

## Implementation Phases
- [ ] Phase 1: `daily-loop.ts` 日期计算改用 `fmt()`（4 处替换：morning today/yesterday、evening today/tomorrow）
- [ ] Phase 2: `engine.ts` 日期计算改用 `fmt()`（evening 分支 today + fallback checkDevice today）
- [ ] Phase 3: `daily-loop.ts` 重写晨间 prompt（soul/profile 为主、字数放宽）
- [ ] Phase 4: `templates.ts` 同步更新 MORNING_PROMPT 模板（字数 ≤15→≤30 + soul/profile 占位符）
- [ ] Phase 5: 单元测试覆盖时区场景 + 问候风格

## 备注
- `fmt()` 在 `date-anchor.ts` 中已有注释说明"使用本地日期，避免 UTC 时区偏移"，此处只是让 daily-loop 和 engine 也使用同一套逻辑
- evening summary 的 `today` 也应改用 `fmt()`，保持一致性，虽然 8:00 PM 时 UTC 日期恰好与本地一致
- 问候语放宽到 30 字后，前端 `SmartDailyReport` 组件的 greeting 显示区域需确认能容纳（纯 UI 不在本 fix 范围，但标注为边界条件）
- 部署约束：服务器必须设置 `TZ=Asia/Shanghai`，否则 `fmt()` 退化为 UTC 日期
