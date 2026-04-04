---
status: superseded
superseded_by: "daily-report.md"
---

# 统一日报系统：早晚合并 + 周/月报 + 历史存档

> 状态：🔵 Phase 1 已完成，Phase 2-3 待开发

## 概述

将晨间简报和晚间回顾合并为一个统一的"日报"入口，新增周报和月报。
所有报告共享同一套 prompt 管理、上下文注入、缓存存储机制。

## 当前架构

```
前端入口：侧边栏"今日简报" + "每日回顾"（两个按钮）
API：GET /api/v1/daily/briefing + GET /api/v1/daily/evening-summary
Handler：generateMorningBriefing() + generateEveningSummary()（daily-loop.ts）
缓存：daily_briefing 表（type: 'morning' | 'evening'）
Soul/Profile 注入：loadSoul(deviceId, userId) → soul.content（纯文本）
                    loadProfile(deviceId, userId) → user_profile.content（纯文本）
Prompt：硬编码在 daily-loop.ts 的 handler 函数中
```

## 目标架构

```
前端入口：侧边栏"日报"按钮（单一入口）+ "历史报告"入口
API：GET /api/v1/report?mode=auto|morning|evening|weekly|monthly
Handler：generateReport(mode, deviceId, userId) — 统一入口
缓存：daily_briefing 表扩展（type: 'morning'|'evening'|'weekly'|'monthly'）
Prompt：外置为模板文件（gateway/src/prompts/）
```

## Prompt 组装链路（当前已验证可行）

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
   → 渲染 prompt 模板（注入 soul + profile + 业务数据）
   → chatCompletion(messages, { json: true, tier: "report" })
   → 解析 + 缓存 + 返回
```

## 四种报告模式

### mode=auto 路由规则

```typescript
function resolveMode(hour: number): "morning" | "evening" {
  // 6-14 点 → morning（早间+午间都用 morning）
  // 14-次日6点 → evening
  return hour >= 6 && hour < 14 ? "morning" : "evening";
}
```

### 各模式数据源（真实表名）

#### morning — 今日安排

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

#### evening — 今日回顾

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

-- 今日未完成（用于 tomorrow_preview）
SELECT t.id, t.text, t.priority
FROM todo t
JOIN record r ON r.id = t.record_id
WHERE (r.user_id = $1 OR t.user_id = $1) AND t.done = false
ORDER BY t.priority DESC LIMIT 5;
```

注入变量：`{today_done}` `{today_records}` `{today_pending}` `{active_goals}`
视角轮换：按 `new Date().getDay()` 选择（见 perspectives 定义）

#### weekly — 周报

```sql
-- 7天完成数（按天聚合）
SELECT completed_at::date as day, COUNT(*) as done_count
FROM todo t JOIN record r ON r.id = t.record_id
WHERE (r.user_id = $1 OR t.user_id = $1) AND t.done = true
  AND t.completed_at::date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1
GROUP BY day ORDER BY day;

-- 7天晚间简报 headline（从 daily_briefing 缓存取）
SELECT briefing_date, content->>'headline' as headline,
       content->'cognitive_highlights' as highlights
FROM daily_briefing
WHERE (user_id = $1 OR device_id = $2) AND briefing_type = 'evening'
  AND briefing_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE - 1
ORDER BY briefing_date;

-- 活跃目标（同 morning）
```

注入变量：`{week_stats}` `{week_evening_summaries}` `{active_goals}`

#### monthly — 月报

```sql
-- 本月周报摘要（从 daily_briefing 取 type='weekly'）
SELECT briefing_date, content->>'headline' as headline,
       content->>'weekly_pattern' as pattern,
       content->'top_moments' as moments,
       content->'stats' as stats
FROM daily_briefing
WHERE (user_id = $1 OR device_id = $2) AND briefing_type = 'weekly'
  AND briefing_date >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY briefing_date;

-- 月度目标总结
SELECT g.id, g.title, g.status,
  COUNT(t.id) FILTER (WHERE t.done) as done_count,
  COUNT(t.id) as total_count
FROM goal g
LEFT JOIN todo t ON t.goal_id = g.id
WHERE g.user_id = $1
GROUP BY g.id;

-- 月度 strike 极性分布（替代 tag_trends）
SELECT polarity, COUNT(*) as count
FROM strike s
JOIN record r ON r.id = s.record_id
WHERE r.user_id = $1
  AND s.created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY polarity ORDER BY count DESC;
```

注入变量：`{weekly_summaries}` `{monthly_goals}` `{polarity_trends}` `{month_stats}`

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

### 模板文件结构

```
gateway/src/prompts/
├── morning.md      — 晨间 system prompt
├── evening.md      — 晚间 system prompt
├── weekly.md       — 周报 system prompt
├── monthly.md      — 月报 system prompt
└── perspectives.md — 晚间视角定义（4种）
```

每个 `.md` 文件包含完整的 system prompt 文本，`{变量名}` 占位符在 handler 中替换。

### 视角轮换（晚间专用）

| 星期 | 视角 | 原因 |
|------|------|------|
| 周一 | 成就感 | 新周开始，强化完成感 |
| 周二 | 节奏感 | 观察精力分配 |
| 周三 | 成长线 | 一周中段，看认知变化 |
| 周四 | 连接感 | 关注人和协作 |
| 周五 | 成就感 | 周末前收尾 |
| 周六 | 节奏感 | 非工作日节奏 |
| 周日 | 成长线 | 周末反思 |

## 统一输出 Schema

### 公共字段（所有模式）

```typescript
interface ReportBase {
  mode: "morning" | "evening" | "weekly" | "monthly";
  generated_at: string;  // ISO8601
  headline: string;      // ≤25-35字（按模式）
  comparison: string;    // ≤25字，与上期对比，无数据时空字符串
}
```

### morning 专属

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

### evening 专属

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

### weekly 专属

```typescript
interface WeeklyReport extends ReportBase {
  week_range: string;          // "YYYY-MM-DD ~ YYYY-MM-DD"
  weekly_pattern: string;      // ≤60字，本周规律
  top_moments: string[];       // 引用晚间 highlights，最多2条
  goal_week_progress: Array<{
    id: string;
    title: string;
    week_done: number;
    total_done: number;
    total_count: number;
    note: string;
  }>;
  next_week_question: string;  // ≤35字，一个问题
  stats: { total_done: number; total_records: number; active_days: number; best_day: string | null };
}
```

### monthly 专属

```typescript
interface MonthlyReport extends ReportBase {
  month: string;               // "YYYY-MM"
  month_theme: string;         // ≤60字，本月主题
  goal_month_summary: Array<{
    id: string;
    title: string;
    month_done: number;
    total_done: number;
    total_count: number;
    status: string;
    note: string;
  }>;
  top_insight: string;         // ≤60字，引用原文
  month_question: string;      // ≤40字，带入下月的问题
  stats: { total_done: number; total_records: number; active_days: number; total_days: number; completion_rate: number };
}
```

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

## 缓存与存储

### daily_briefing 表扩展

```sql
-- 当前已有：type 'morning' | 'evening'
-- 需要支持：'weekly' | 'monthly'
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

## 前端改动

### 侧边栏

```
原来：
  "每日回顾" → setActiveOverlay("evening-summary")
  "今日简报" → setActiveOverlay("morning-briefing")

改为：
  "日报" → setActiveOverlay("daily-report")  // 单一入口
  "历史报告" → setActiveOverlay("report-history")  // 新增
```

### 日报组件 (SmartDailyReport)

```
调 /api/v1/report?mode=auto
→ 根据返回的 mode 字段渲染不同布局
→ morning: headline + today_focus + goals + carry_over
→ evening: headline + accomplishments + highlights + goals + tomorrow
→ 统一的卡片滑动交互
```

### 历史报告页面

```
从 daily_briefing 表按日期倒序查
分 tab：日报 / 周报 / 月报
每条显示：日期 + headline + 点击展开完整内容
```

## 实施阶段

### Phase 1：合并早晚报 + Prompt 外置
- 新建 `gateway/src/prompts/` 目录，放入 4 个 prompt 模板
- 新建 `gateway/src/handlers/report.ts` 统一 handler
- 新建 `GET /api/v1/report?mode=auto|morning|evening`
- 前端合并为一个"日报"按钮 + SmartDailyReport 组件
- 保留旧 API 兼容（redirect 到新 API）

### Phase 2：周报 + 月报 + 历史
- 实现 weekly/monthly handler
- daily_briefing 表加 user_id 列 + 新 type 支持
- 新建历史报告查询 API + 前端页面
- 周报定时触发（每周日 20:00）
- 月报定时触发（每月1日 09:00）

### Phase 3：增强
- 晚间注入用户今日原始记录（record.transcript）
- 周报引用晚间 cognitive_highlights
- 月报引用周报 top_moments
- 报告质量校验（headline 长度、引用检查）

## 依赖
- gateway/src/handlers/daily-loop.ts — 现有生成逻辑（Phase 1 重构）
- gateway/src/soul/manager.ts — loadSoul（已支持 userId 优先）
- gateway/src/profile/manager.ts — loadProfile（同上）
- gateway/src/db/repositories/daily-briefing.ts — 缓存读写
- gateway/src/ai/provider.ts — chatCompletion
- daily_briefing 表 — 需扩展
- features/daily/ — 前端组件
