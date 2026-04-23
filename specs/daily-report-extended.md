---
id: "053b"
title: "Daily Report — Extended (Weekly/Monthly/Cognitive)"
status: completed
domain: report
risk: medium
dependencies: ["daily-report-core.md"]
superseded_by: null
related: ["daily-report-core.md"]
created: 2026-03-23
updated: 2026-04-04
---

# Daily Report System — Extended (日报系统 · 扩展能力)

> 拆分自原 `daily-report.md`（id: 053）。核心日报（统一 API、晨间简报、晚间总结、Prompt 模板、缓存存储）见 [daily-report-core.md](daily-report-core.md)。

## 概述

本文档覆盖日报系统的扩展能力：

- **Report Merging Logic** — 前端 SmartDailyReport 组件与 Hook 策略
- **Cognitive Insights** — 认知引擎产出注入日报
- **Weekly & Monthly** — 周报与月报
- **Implementation Phases** — 全部实施阶段

---

## 4. Report Merging Logic (报告合并逻辑)

<!-- 来源：daily-report-merge.md — 前端合并策略与 Hook 机制 -->
<!-- 注：API 层合并设计已被 Section 1 (Unified API) 覆盖，此处保留前端组件与 Hook 策略 -->

### 信息架构（SmartDailyReport 组件）

```
SmartDailyReport
├── Header: "日报 . 4月2日 周四"  (不分晨间/晚间)
├── Greeting: 一句话时段问候 (AI 个性化)
├── Section 1: 当前最相关的行动区
│   ├── 晨启: "今日计划" → 排期待办 + 遗留
│   ├── 午间: "上午战报" → 已完成 + 下午待做
│   ├── 午后: "收尾清单" → 未完成 + 建议重排
│   └── 晚间: "今日成就" → 完成列表 + 动效
├── Section 2: 目标脉搏 (所有时段共用)
│   └── 活跃目标卡片：名称 + 迷你进度条 + 今日贡献
├── Section 3: 路路发现 (有内容才显示)
│   └── 认知亮点 / AI 建议 / 关注提醒
└── Footer CTA:
    ├── 晨启: "开始今天" → 关闭
    ├── 晚间: "和路路聊聊" → 打开 Chat
    └── 其他: "继续" → 关闭
```

### 前端改动

```
原来：
  "每日回顾" → setActiveOverlay("evening-summary")
  "今日简报" → setActiveOverlay("morning-briefing")

改为：
  "日报" → setActiveOverlay("daily-report")  // 单一入口
  "历史报告" → setActiveOverlay("report-history")  // 新增
```

日报组件调用 `/api/v1/report?mode=auto`，根据返回的 mode 字段渲染不同布局：
- morning: headline + today_focus + goals + carry_over
- evening: headline + accomplishments + highlights + goals + tomorrow
- 统一的卡片滑动交互

### 用户 Hook 策略

**目标**：让用户每天至少打开 2 次 app

| Hook | 机制 | 时机 |
|------|------|------|
| **晨间推送** | 本地通知："小明，今天有 3 件事等你" | 用户设置的回顾时间 (onboarding Q5) |
| **午间闪报** | 通知栏极简："上午完成 2/5 继续加油" | 12:00 (仅有待办时) |
| **晚间温暖** | 通知："今天完成了 4 件事，来看看路路的发现" | 21:00 |
| **首次打开自动弹** | App 恢复前台时，如果距上次查看 >4h，自动展示 | 每次前台恢复 |
| **红点徽标** | 侧边栏"日报"按钮带数字 badge = 未读发现数 | 有新内容时 |

### 场景 H1: 早报推送落地即看即读 <!-- ✅ completed (fix-daily-report-notify) -->
```
假设 (Given)  用户订阅了早报推送
当   (When)   系统到达早报推送时间
那么 (Then)   用户收到一条早报通知
并且 (And)    用户打开 app 后立即看到今日简报内容，无需等待加载
并且 (And)    同一天内用户不会再次收到重复的早报通知
```

### 场景 H2: 晚报推送同样预生成且去重 <!-- ✅ completed (fix-daily-report-notify) -->
```
假设 (Given)  用户订阅了晚报推送
当   (When)   系统到达晚报推送时间
那么 (Then)   用户收到一条晚报通知并能立即查看内容
并且 (And)    即使服务重启或降级，用户同一天只会收到一次晚报通知
```

### 与当前架构的对应

| 当前 | 合并后 |
|------|--------|
| MorningBriefing 组件 | SmartDailyReport (晨启模式) |
| EveningSummary 组件 | SmartDailyReport (晚间模式) |
| 侧边栏"今日简报" + "每日回顾" | 合并为一个"日报"按钮 |
| auto-trigger 仅 7-10am | 每次前台恢复 + 距上次 >4h |
| 2 个 API endpoint | 合并为 1 个 `/api/v1/report?mode=auto` |

---

## 5. Cognitive Insights (认知洞察注入)

<!-- 来源：cognitive-report.md -->

### 概述

认知引擎每天产出矛盾检测、Cluster 变化、认知模式，这些数据需要喂给日报。
这是打通"后端能力 → 用户感知"的最大价值杠杆。

### 场景 C1: daily-cycle 末尾生成结构化认知报告
<!-- ✅ completed -->
```
假设 (Given)  daily-cycle 完成聚类、矛盾检测、融合、维护
当   (When)   所有步骤执行完毕
那么 (Then)   调用 generateCognitiveReport(userId) 生成报告
并且 (And)    报告包含：
      - today_strikes: { perceive: N, judge: N, realize: N, intend: N, feel: N }
      - contradictions: [{ strikeA_nucleus, strikeB_nucleus, strength }]
      - cluster_changes: { created: [...], merged: [...], archived: [...] }
      - cognitive_patterns: [{ description, evidence_strike_ids }]（如有）
      - behavior_drift: { intend_count, todo_completed, completion_rate }
并且 (And)    存入 daily_briefing 表（type='cognitive_report'）
```

### 场景 C2: 前端读取认知报告
<!-- ✅ completed -->
```
假设 (Given)  用户打开每日回顾页面
当   (When)   GET /api/v1/report?mode=auto
那么 (Then)   返回中包含 cognitive_highlights 字段：
      { contradictions, cluster_changes, top_realize, behavior_drift }
并且 (And)    前端在"路路发现"区域渲染
并且 (And)    洞察中的引用可点击跳转原始日记
```

### 场景 C3: 无活动日的降级处理
<!-- ✅ completed -->
```
假设 (Given)  用户今天没有任何输入
当   (When)   cognitive_report 为空
那么 (Then)   晨间简报聚焦于历史回顾（"还记得上周的这个想法吗？"）
并且 (And)    晚间总结显示温暖的空状态（"安静的一天也是好的一天"）
并且 (And)    不显示统计面板
```

### 场景 C4: Digest 调度优化（冷启动 + 重试）
<!-- ✅ completed -->
```
假设 (Given)  用户处于冷启动期（record 数 < 20）
当   (When)   新 record 提交
那么 (Then)   无论长度都立即触发 Digest（不走 3h batch）
并且 (And)    让用户尽快看到认知报告产出

假设 (Given)  某条 record 的 Digest 失败（AI 超时等）
当   (When)   下一轮 batch 执行
那么 (Then)   自动重试未消化的 record（digested_at IS NULL）
并且 (And)    最多重试 3 次，之后标记 digested_at + error message
```

### 认知报告数据量控制

- contradictions 最多 5 条
- cluster_changes 最多 10 条
- daily-cycle 执行失败时，日报降级为不含认知数据的版本

### AI 调用

- 晨间 1 次（报告注入 prompt 后 AI 生成自然语言）
- 晚间 1 次
- 认知报告本身：0 次（纯数据聚合）

---

## 6. Weekly & Monthly (周报与月报)

<!-- 来源：unified-daily-report.md Phase 2-3 -->

### weekly 数据源

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

### monthly 数据源

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

### 历史报告页面

```
从 daily_briefing 表按日期倒序查
分 tab：日报 / 周报 / 月报
每条显示：日期 + headline + 点击展开完整内容
```

---

## Implementation Phases (实施阶段)

### Phase 1: 合并早晚报 + Prompt 外置
<!-- ✅ completed (unified-daily-report Phase 1) -->
- 新建 `gateway/src/prompts/` 目录，放入 4 个 prompt 模板
- 新建 `gateway/src/handlers/report.ts` 统一 handler
- 新建 `GET /api/v1/report?mode=auto|morning|evening`
- 前端合并为一个"日报"按钮 + SmartDailyReport 组件
- 保留旧 API 兼容（redirect 到新 API）
- 统一 auto-trigger 逻辑（每次前台恢复 + 距上次 >4h）

### Phase 2: 周报 + 月报 + 历史
- 实现 weekly/monthly handler
- daily_briefing 表加 user_id 列 + 新 type 支持
- 新建历史报告查询 API + 前端页面
- 周报定时触发（每周日 20:00）
- 月报定时触发（每月1日 09:00）

### Phase 3: 认知洞察注入增强
<!-- ✅ completed (cognitive-report 全部场景) -->
- daily-cycle 末尾生成 cognitive_report（纯数据聚合）
- 晨间注入昨日认知数据（矛盾、Cluster、行为偏差）
- 晚间注入今日认知统计（极性分布、realize Strike、情感轨迹）
- 前端"路路发现"区域渲染认知洞察
- Digest 冷启动优化 + 重试机制

### Phase 4: Hook 增强
- 前台恢复自动弹出（Capacitor App.addListener）
- 本地推送通知（晨间/午间/晚间）
- 红点 badge

### Phase 5: 报告质量 + 引用链
- 晚间注入用户今日原始记录（record.transcript）
- 周报引用晚间 cognitive_highlights
- 月报引用周报 top_moments
- 报告质量校验（headline 长度、引用检查）

---

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `gateway/src/prompts/*.md` | 新建：4 个 prompt 模板 |
| `gateway/src/handlers/report.ts` | 新建：统一 handler |
| `gateway/src/cognitive/report.ts` | 新建：认知报告生成逻辑 |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：末尾调用 report 生成 |
| `gateway/src/handlers/daily-loop.ts` | 修改（Phase 1 重构） |
| `gateway/src/routes/daily-loop.ts` | 修改：新路由 + 返回认知字段 |
| `gateway/src/soul/manager.ts` | 依赖：loadSoul（已支持 userId 优先） |
| `gateway/src/profile/manager.ts` | 依赖：loadProfile |
| `gateway/src/db/repositories/daily-briefing.ts` | 修改：缓存读写扩展 |
| `gateway/src/ai/provider.ts` | 依赖：chatCompletion |
| `features/daily/` → `features/report/` | 修改：前端组件重构 |
| `app/page.tsx` | 修改：overlay 管理 |
