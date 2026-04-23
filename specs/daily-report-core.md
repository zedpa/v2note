---
id: "053a"
title: "Daily Report — Core"
status: active
domain: report
risk: medium
dependencies: ["cognitive-engine-v2.md"]
superseded_by: null
related: ["daily-report-extended.md"]
created: 2026-03-23
updated: 2026-04-17
---

# Daily Report System — Core (日报系统 · 核心)

> 拆分自原 `daily-report.md`（id: 053）。扩展能力（周报/月报/认知洞察/实施阶段）见 [daily-report-extended.md](daily-report-extended.md)。
>
> 合并自：`daily-report-merge.md`、`unified-daily-report.md`、`cognitive-report.md`
>
> 以 `unified-daily-report.md` 为主体，其余两份的独有内容按模块整合。

## 概述

将晨间简报和晚间回顾合并为一个统一的"日报"入口，新增周报和月报。
所有报告共享同一套 prompt 管理、上下文注入、缓存存储机制。
认知引擎（矛盾检测、Cluster 变化、认知模式）的产出注入日报，打通"后端能力 → 用户感知"。

### 核心认知

用户不关心"这是晨间还是晚间报告"，用户关心的是：
> **"我现在打开 app，能看到什么对我有价值的东西？"**

### 当前架构

```
前端入口：侧边栏"今日简报" + "每日回顾"（两个按钮）
API：GET /api/v1/daily/briefing + GET /api/v1/daily/evening-summary
Handler：generateMorningBriefing() + generateEveningSummary()（daily-loop.ts）
缓存：daily_briefing 表（type: 'morning' | 'evening'）
Soul/Profile 注入：loadSoul(deviceId, userId) → soul.content（纯文本）
                    loadProfile(deviceId, userId) → user_profile.content（纯文本）
Prompt：硬编码在 daily-loop.ts 的 handler 函数中
认知引擎：daily-cycle.ts 完整编排 clustering → contradiction → promote → maintenance，
          但产出未喂给日报（二者没有连接）
```

### 目标架构

```
前端入口：侧边栏"日报"按钮（单一入口）+ "历史报告"入口
API：GET /api/v1/report?mode=auto|morning|evening|weekly|monthly
Handler：generateReport(mode, deviceId, userId) — 统一入口
缓存：daily_briefing 表扩展（type: 'morning'|'evening'|'weekly'|'monthly'|'cognitive_report'）
Prompt：外置为模板文件（gateway/src/prompts/）
认知数据：daily-cycle 末尾生成 cognitive_report，日报 prompt 注入认知洞察
```

---

## 1. Unified API & Mode System (统一 API 与模式)

<!-- 来源：unified-daily-report.md — API 设计 + daily-report-merge.md 合并 API 部分 -->

### Prompt 组装链路

```
1. Route 层
   GET /api/v1/report?mode=auto
   → getDeviceId(req)   // 从 JWT 的 payload.deviceId
   → getUserId(req)     // 从 JWT 的 payload.userId（可选）

2. Handler 层
   → 根据 mode（或 auto 判断时段）决定使用哪个 prompt 模板
   → loadSoul(deviceId, userId)
     // 优先: soul WHERE user_id = $1
     // Fallback: soul WHERE device_id = $1
     // 返回: { content: string }（纯文本，AI 人设描述）
   → loadProfile(deviceId, userId)
     // 同上查询逻辑
     // 返回: { content: string }（纯文本，用户画像）
   → 查询业务数据（待办/记录/目标/统计）
   → 加载认知报告（cognitive_report，如有）
   → 渲染 prompt 模板（注入 soul + profile + 业务数据 + 认知数据）
   → chatCompletion(messages, { json: true, tier: "report" })
   → 解析 + 缓存 + 返回
```

### mode=auto 路由规则

```typescript
function resolveMode(hour: number): "morning" | "evening" {
  // 6-14 点 → morning（早间+午间都用 morning）
  // 14-次日6点 → evening
  return hour >= 6 && hour < 14 ? "morning" : "evening";
}
```

> **注**：`daily-report-merge.md` 设计了 5 段时段策略（晨启/午间/午后/晚间/深夜），
> 当前 Phase 1 简化为 morning/evening 两段。5 段细分策略可在后续增强中按需启用，
> 映射关系：晨启+午间 → morning，午后+晚间+深夜 → evening。

### 5 段时段策略（远期参考，来自 daily-report-merge）

| 时段 | 时间 | 核心情绪 | 内容策略 | 语气 |
|------|------|----------|----------|------|
| 晨启 | 6-11 | "今天做什么" | 待办优先 + 昨日遗留 + 目标行动项 | 轻快、行动导向 |
| 午间 | 11-14 | "进行得怎样" | 上午完成 + 下午预览 + 进度条 | 鼓励、中场检查 |
| 午后 | 14-18 | "还剩什么" | 未完成待办 + 目标缺口 + 建议优先级 | 务实、聚焦 |
| 晚间 | 18-22 | "今天值了吗" | 完成回顾 + 认知收获 + 明日预告 | 温暖、肯定 |
| 深夜 | 22-6 | "安心入睡" | 一句话总结 + 明日第一件事 | 简短、安抚 |

### 统一输出 Schema

#### 公共字段（所有模式）

```typescript
interface ReportBase {
  mode: "morning" | "evening" | "weekly" | "monthly";
  generated_at: string;  // ISO8601
  headline: string;      // <=25-35字（按模式）
  comparison: string;    // <=25字，与上期对比，无数据时空字符串
}
```

#### morning 专属

```typescript
interface MorningReport extends ReportBase {
  today_focus: string[];
  goal_progress: Array<{
    id: string;
    title: string;
    done_count: number;
    total_count: number;
    note: string;
  }>;
  carry_over: string[];
  ai_suggestions: string[];
  stats: { yesterday_done: number; yesterday_total: number; streak: number };
}
```

#### evening 专属

```typescript
interface EveningReport extends ReportBase {
  accomplishments: string[];
  cognitive_highlights: string[];  // 必须引用 today_records 原文
  goal_updates: Array<{
    id: string;
    title: string;
    done_count: number;
    remaining_count: number;
    note: string;
  }>;
  attention_needed: string[];
  tomorrow_preview: string[];
  stats: { done: number; new_records: number; streak: number };
}
```

#### weekly 专属

```typescript
interface WeeklyReport extends ReportBase {
  week_range: string;          // "YYYY-MM-DD ~ YYYY-MM-DD"
  weekly_pattern: string;      // <=60字，本周规律
  top_moments: string[];       // 引用晚间 highlights，最多2条
  goal_week_progress: Array<{
    id: string;
    title: string;
    week_done: number;
    total_done: number;
    total_count: number;
    note: string;
  }>;
  next_week_question: string;  // <=35字，一个问题
  stats: { total_done: number; total_records: number; active_days: number; best_day: string | null };
}
```

#### monthly 专属

```typescript
interface MonthlyReport extends ReportBase {
  month: string;               // "YYYY-MM"
  month_theme: string;         // <=60字，本月主题
  goal_month_summary: Array<{
    id: string;
    title: string;
    month_done: number;
    total_done: number;
    total_count: number;
    status: string;
    note: string;
  }>;
  top_insight: string;         // <=60字，引用原文
  month_question: string;      // <=40字，带入下月的问题
  stats: { total_done: number; total_records: number; active_days: number; total_days: number; completion_rate: number };
}
```

### 合并后接口（来自 daily-report-merge，已被 unified 覆盖）

<!-- daily-report-merge.md 的 DailyReport interface 已被上方 ReportBase + MorningReport/EveningReport 替代。
     daily-report-merge 额外的 `action`（行动区）、`discoveries`（路路发现）、`cta`（底部按钮）
     字段设计保留供前端组件参考：

     action: { title, completed[], pending[], carry_over[] }  → 映射到 morning.today_focus / evening.accomplishments
     discoveries: string[]  → 映射到 evening.cognitive_highlights
     goals: Array<{ title, total, done_today, remaining, note }>  → 映射到 goal_progress / goal_updates
     tomorrow: { first_thing, scheduled[] }  → 映射到 evening.tomorrow_preview
     cta: { text, action: "close" | "chat" }  → 前端 SmartDailyReport 组件自行根据 mode 决定
-->

---

## 2. Morning Briefing (晨间简报)

### 数据源

```sql
-- 未完成待办（按优先级）
SELECT t.id, t.text, t.priority, t.scheduled_start, t.goal_id
FROM todo t
JOIN record r ON r.id = t.record_id
WHERE (r.user_id = $1 OR t.user_id = $1) AND t.done = false
ORDER BY t.priority DESC, t.scheduled_start ASC NULLS LAST
LIMIT 10;

-- 活跃目标 + 关联待办数
SELECT g.id, g.title, g.status,
  COUNT(t.id) FILTER (WHERE t.done) as done_count,
  COUNT(t.id) as total_count
FROM goal g
LEFT JOIN todo t ON t.goal_id = g.id
WHERE g.user_id = $1 AND g.status IN ('active', 'progressing')
GROUP BY g.id;

-- 昨日统计
-- 复用现有 todoRepo.countByUserDateRange(userId, start, end)
```
注入变量：`{pending_todos}` `{active_goals}` `{yesterday_stats}`

### 认知数据注入（来自 cognitive-report）

<!-- ✅ completed -->

当存在昨日 `cognitive_report` 时，晨间 prompt 额外注入：

- 昨日矛盾发现（如有）
- 活跃 Cluster top-3 名称
- 行为偏差（"你昨天设了5个目标但只完成1个"）
- 今日建议行动

矛盾部分提供"深入了解"链接（跳转决策工坊）。

### 场景

#### 场景 M1: 早上打开 app
```
假设 (Given)  用户在 8:30 打开 app，有 5 个今日待办（2 个遗留）
当   (When)   app 加载完成
那么 (Then)   自动弹出日报，晨启模式
并且 (And)    显示"早上好，小明" + 今日计划列表 + 遗留提醒
并且 (And)    底部 CTA "开始今天"
```

#### 场景 M2: 晨间简报注入认知数据
<!-- ✅ completed -->
```
假设 (Given)  晨间简报触发
并且 (And)    存在昨日 cognitive_report
当   (When)   daily-loop.ts 构建 briefing prompt
那么 (Then)   system prompt 注入：
      - 昨日矛盾发现（如有）
      - 活跃 Cluster top-3 名称
      - 行为偏差（"你昨天设了5个目标但只完成1个"）
      - 今日建议行动
并且 (And)    路路口吻生成自然语言简报
并且 (And)    矛盾部分提供"深入了解"链接（跳转决策工坊）
```

#### 场景 M3: 晨间简报正常加载 <!-- ✅ completed (fix-daily-briefing-500) -->
```
假设 (Given)  用户已登录，有若干待办（含已排期和未排期）
当   (When)   用户打开今日简报
那么 (Then)   页面显示问候语、今日待办列表、目标进展与建议
并且 (And)    无论待办排期字段格式如何，用户都能正常看到当日内容
```

#### 场景 M4: 晨间问候使用本地日期且体现人格 <!-- ✅ completed (fix-morning-briefing) -->
```
假设 (Given)  用户已设置 soul/profile，且本地时间为早上
当   (When)   用户在本地早晨打开今日简报
那么 (Then)   问候语中的日期为用户本地日期，不出现跨天错位
并且 (And)    问候语风格与用户人格一致，不以待办数量作为主题
并且 (And)    问候长度在 30 字以内，自然温暖
```

#### 场景 M5: 晨间简报展示目标脉搏 <!-- ✅ completed (fix-briefing-prompt-v2) -->
```
假设 (Given)  用户有进行中的目标及关联待办
当   (When)   用户打开晨间简报
那么 (Then)   页面显示"目标脉搏"区域，列出活跃目标名称与完成进度
并且 (And)    晚间总结中同时显示日记洞察与每日肯定两段内容
```

#### 场景 M6: 晨间简报只展示今日相关待办 <!-- ✅ completed (fix-briefing-stale-todos) -->
```
假设 (Given)  用户有 3 个今日排期待办，和 5 个无排期的古早待办
当   (When)   用户打开晨间简报
那么 (Then)   "今日焦点"只显示今日排期的 3 个待办
并且 (And)    古早无排期的待办不出现在当日简报中
并且 (And)    逾期待办显示在"遗留"区域而非"今日焦点"
```

#### 场景 M7: 凌晨时段日报日期归属本地"今天" <!-- ✅ completed (fix-timezone-systematic) -->
```
假设 (Given)  用户身处东八区，当地时间为凌晨 01:00
当   (When)   用户打开日报或搜索"今天的日记"
那么 (Then)   用户看到的是本地"今天"对应的内容，而非前一天
并且 (And)    凌晨新建的日记在当日日报、搜索和导出文件名中归属同一个本地日期
并且 (And)    凌晨 00:00~08:00 时段与白天的行为完全一致
```

---

## 3. Evening Summary (晚间总结)

### 路径统一（fix-evening-report-quality）

所有晚间总结入口（`EveningSummary`、`SmartDailyReport`、legacy `/report?mode=evening|auto`）统一走 `daily-loop.ts: generateEveningSummary()`（v2 路径）。禁止 fallback 到 legacy `report.ts: generateEveningReport()`——该路径把全量 pending 错标为 `todayPending` 污染 `tomorrow_preview`。死代码 `gateway/src/prompts/{evening,morning,perspectives}.md` 已删除。

### 数据源

```sql
-- 今日完成
SELECT t.id, t.text, t.completed_at, t.goal_id
FROM todo t
JOIN record r ON r.id = t.record_id  
WHERE (r.user_id = $1 OR t.user_id = $1) AND t.done = true
  AND t.completed_at::date = CURRENT_DATE;

-- 今日原始记录（关键：给 AI 引用素材）
SELECT r.id, r.transcript, r.short_summary, r.created_at
FROM record r
WHERE r.user_id = $1 AND r.created_at::date = CURRENT_DATE
ORDER BY r.created_at DESC
LIMIT 5;

-- 明日预排（用于 tomorrow_preview）— 只取排期到明天的待办
SELECT t.id, t.text, t.priority, t.scheduled_start
FROM todo t
JOIN record r ON r.id = t.record_id
WHERE (r.user_id = $1 OR t.user_id = $1) AND t.done = false
  AND t.scheduled_start::date = (CURRENT_DATE + INTERVAL '1 day')
ORDER BY t.priority DESC LIMIT 5;
```

注入变量：`{today_done}` `{today_records}` `{tomorrow_scheduled}` `{active_goals}`。`tomorrow_preview` 只能来自明日排期的待办，**禁止**用全量 pending 替代（已完成/无排期/历史 pending 都不进 preview）。

### 视角轮换（晚间专用）

按 `new Date().getDay()` 选择视角：

| 星期 | 视角 | 原因 |
|------|------|------|
| 周一 | 成就感 | 新周开始，强化完成感 |
| 周二 | 节奏感 | 观察精力分配 |
| 周三 | 成长线 | 一周中段，看认知变化 |
| 周四 | 连接感 | 关注人和协作 |
| 周五 | 成就感 | 周末前收尾 |
| 周六 | 节奏感 | 非工作日节奏 |
| 周日 | 成长线 | 周末反思 |

### 认知数据注入（来自 cognitive-report）

<!-- ✅ completed -->

晚间 prompt 注入：

- 今日极性分布 + 与近7天均值对比
- 最有价值的 realize Strike（如有）
- 行动完成率 + 与昨日对比
- 情感轨迹（feel Strike 按时间排列）
- 路路口吻 + 1-2 个反思引导问题（与具体 Strike 相关，非泛泛而谈）

### 场景

#### 场景 E1: 晚上手动查看
```
假设 (Given)  用户 21:00 点击侧边栏"日报"
当   (When)   日报加载
那么 (Then)   晚间模式
并且 (And)    显示"今日成就" + 认知发现 + 明日预告
并且 (And)    底部 CTA "和路路聊聊"
```

#### 场景 E2: 下午重新打开 app（距上次 >4h）
```
假设 (Given)  用户 14:00 打开 app，上午完成了 3 个待办
当   (When)   距上次查看日报 >4h
那么 (Then)   自动弹出日报，午后模式
并且 (And)    显示"下午好" + 上午完成 3 件 + 还剩 2 件未完成
并且 (And)    底部 CTA "继续"
```

#### 场景 E3: 晚间总结注入认知统计
<!-- ✅ completed -->
```
假设 (Given)  晚间总结触发
当   (When)   daily-loop.ts 构建 summary prompt
那么 (Then)   system prompt 注入：
      - 今日极性分布 + 与近7天均值对比
      - 最有价值的 realize Strike（如有）
      - 行动完成率 + 与昨日对比
      - 情感轨迹（feel Strike 按时间排列）
并且 (And)    路路口吻 + 1-2 个反思引导问题
并且 (And)    反思问题与具体 Strike 相关（非泛泛而谈）
```

#### 场景 E4: 深夜打开
```
假设 (Given)  用户 23:30 打开 app
当   (When)   日报弹出
那么 (Then)   极简模式：一句话总结 + 明日第一件事
并且 (And)    语气温暖："今天辛苦了，明天第一件事是..."
并且 (And)    不显示目标进度等复杂卡片
```

#### 场景 E5: 晚间总结明日预览只含明日排期 <!-- ✅ completed (fix-evening-report-quality) -->
```
假设 (Given)  用户有 1 个排明天的待办 + 2 个无排期 pending + 今天完成 2 个
当   (When)   用户打开"晚间总结"或"日报"
那么 (Then)   tomorrow_preview 只含那 1 个明日排期待办
并且 (And)    已完成/无排期 pending 均不出现；所有入口统一返回 v2 结构（insight/affirmation/正确 tomorrow_preview）
```

---

## Prompt 模板管理

### 语气策略：Soul 自适应

**不硬编码语气。** 让 AI 根据 soul 自己决定风格。

```
## 语言风格

根据 <user_soul> 中描述的性格、价值观和沟通偏好来调整你的语气。
- soul 描述用户喜欢简洁 → 你就简洁
- soul 描述用户比较感性 → 你的表达可以多一些温度
- soul 为空 → 默认口语化、短句、有呼吸感

无论什么风格，以下原则不变：
- 不说"加油""你已经做得很好了""一切都会好的"
- 不建议用户"记录一下""把这个写下来"
- 有时候不问任何问题就是最好的回应
- 情绪就是核心内容时，全力接住，不要急着"做点什么"
- 做了很多 → 跟他一起开心
- 什么都没做 → "今天就这样了"比"明天会更好"真诚
```

### 模板管理

所有日报/周报/月报 prompt 集中在 `gateway/src/prompts/templates.ts`（TS 常量），由 `daily-loop.ts` 的 `generateMorningBriefing()` / `generateEveningSummary()` 消费。历史 `.md` 模板文件（morning/evening/perspectives）已在 fix-evening-report-quality 中删除。

## 空数据降级

| 情况 | 处理 |
|------|------|
| 无待办 | today_focus 返回1条引导语，不编造 |
| 无日记记录 | cognitive_highlights 返回 []，headline 基于待办生成 |
| 昨日/上周无数据 | comparison 返回 "" |
| 周报中某天缺晚间简报 | 跳过该天，不填充"暂无数据" |
| 月报缺周报 | 用该周 todo 聚合数据补充，注明"基于任务数据" |
| soul 为空 | 使用默认口语化风格 |
| 新用户首日 | 只有种子目标，简报聚焦欢迎+引导 |
| 用户今天无任何输入 | 晨间聚焦历史回顾，晚间温暖空状态，不显示统计面板 |
| daily-cycle 执行失败 | 日报降级为不含认知数据的版本 |
| 首次使用无历史数据 | 晨间简报为引导式内容 |

## 缓存与存储

### daily_briefing 表扩展

```sql
-- 当前已有：type 'morning' | 'evening'
-- 需要支持：'weekly' | 'monthly' | 'cognitive_report'
-- 当前 UNIQUE(device_id, briefing_date, briefing_type) 已支持

-- 需新增 user_id 列（如果还没有）
ALTER TABLE daily_briefing ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_daily_briefing_user_date 
  ON daily_briefing(user_id, briefing_date DESC);
```

### 缓存策略

| 模式 | TTL | 刷新条件 |
|------|-----|----------|
| morning | 当天有效 | forceRefresh=true 或隔天自动失效 |
| evening | 当天有效 | 同上 |
| weekly | 本周有效 | forceRefresh=true 或跨周自动失效 |
| monthly | 本月有效 | forceRefresh=true 或跨月自动失效 |

---

## 边界条件

- [x] 跨日（23:59 → 00:01）时日报内容切换 — `fix-morning-briefing`: 日期改用 `fmt()` 本地时间
- [x] 日期计算使用本地时间而非 UTC — `fix-morning-briefing`: `toISOString().split("T")[0]` → `fmt()`
- [x] 晨间问候基于 soul/profile 而非待办数据 — `fix-morning-briefing`: prompt 重写 + 字数 ≤30
- [ ] 无待办、无目标的极端空状态
- [ ] 快速连续打开/关闭 → 不重复 API 请求（加缓存 TTL）
- [ ] 离线状态 → 显示上次缓存的日报 + "离线模式"标记
- [ ] 用户手动刷新 → 强制重新生成
- [ ] cognitive_report 数据量控制：contradictions 最多 5 条，cluster_changes 最多 10 条
- [ ] 首次使用（无历史数据）：晨间简报为引导式内容
- [ ] daily-cycle 执行失败：briefing 降级为不含认知数据的版本

---

## 依赖

- `gateway/src/handlers/daily-loop.ts` — 现有生成逻辑（Phase 1 重构）
- `gateway/src/soul/manager.ts` — loadSoul（已支持 userId 优先）
- `gateway/src/profile/manager.ts` — loadProfile（同上）
- `gateway/src/db/repositories/daily-briefing.ts` — 缓存读写
- `gateway/src/ai/provider.ts` — chatCompletion
- `daily_briefing` 表 — 需扩展
- Capacitor App plugin（Phase 4 推送）

## 备注

- 保留现有 API 端点向后兼容，新端点并行上线
- AI prompt 需要根据时段切换语气和内容重点
- "路路发现"是杀手锏 — 用户来看日报是例行公事，但发现新的认知联结会产生惊喜感
- 验收标准：每日回顾内容从"今天录了3条"变成"你最近关注供应链的频率上升了，有个矛盾需要注意"
