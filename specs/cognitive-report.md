---
status: superseded
superseded_by: "daily-report.md"
id: "cognitive-report"
domain: cognitive
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# 认知报告 + 每日回顾数据源

> 状态：✅ 已完成 | 优先级：Phase 2 | 完成日期：2026-03-24

## 概述
认知引擎每天产出矛盾检测、Cluster 变化、认知模式，但这些数据没有喂给每日回顾。daily-loop.ts 的晨间/晚间 prompt 缺少认知层数据注入。这是打通"后端能力 → 用户感知"的最大价值杠杆。

**当前状态：**
- `daily-cycle.ts`：完整编排 clustering → contradiction → promote → maintenance，产出 alerts，写入 ai-self diary
- `daily-loop.ts`：morning briefing + evening summary，加载 pending todos 和 memory context，但不读取认知引擎产出
- 二者没有连接

## 场景

### 场景 1: daily-cycle 末尾生成结构化认知报告
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

### 场景 2: 晨间简报注入认知数据
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

### 场景 3: 晚间总结注入认知统计
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

### 场景 4: 前端每日回顾读取认知报告
```
假设 (Given)  用户打开每日回顾页面
当   (When)   GET /api/v1/daily-loop/briefing 或 /summary
那么 (Then)   返回中包含 cognitive_highlights 字段：
      { contradictions, cluster_changes, top_realize, behavior_drift }
并且 (And)    前端在晨间/晚间 tab 的"洞察"区域渲染
并且 (And)    洞察中的引用可点击跳转原始日记
```

### 场景 5: 无活动日的降级处理
```
假设 (Given)  用户今天没有任何输入
当   (When)   cognitive_report 为空
那么 (Then)   晨间简报聚焦于历史回顾（"还记得上周的这个想法吗？"）
并且 (And)    晚间总结显示温暖的空状态（"安静的一天也是好的一天"）
并且 (And)    不显示统计面板
```

### 场景 6: Digest 调度优化（冷启动 + 重试）
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

## 边界条件
- [ ] cognitive_report 数据量控制：contradictions 最多 5 条，cluster_changes 最多 10 条
- [ ] 首次使用（无历史数据）：晨间简报为引导式内容
- [ ] daily-cycle 执行失败：briefing 降级为不含认知数据的版本

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/report.ts` | 认知报告生成逻辑 |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：末尾调用 report 生成 |
| `gateway/src/handlers/daily-loop.ts` | 修改：briefing/summary prompt 注入认知数据 |
| `gateway/src/routes/daily-loop.ts` | 修改：返回中加 cognitive_highlights |
| `features/review/components/daily-review.tsx` | 修改：渲染认知洞察区域 |

## 数据库变更
- daily_briefing 表新增 type 字段（'morning'|'evening'|'cognitive_report'）
- 或复用 ai_diary 表加 type='cognitive_report'

## AI 调用
- 晨间 1 次（报告注入 prompt 后 AI 生成自然语言）
- 晚间 1 次
- 认知报告本身：0 次（纯数据聚合）

## 验收标准
每日回顾内容从"今天录了3条"变成"你最近关注供应链的频率上升了，有个矛盾需要注意"。
