---
id: "fix-briefing-prompt-v2"
title: "Fix: 早晚报接入 v2 提示词架构 + 内容质量提升"
status: completed
backport: daily-report-core.md#场景 M5
domain: report
risk: medium
dependencies: ["prompt-architecture-v2.md", "daily-report-core.md"]
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 早晚报接入 v2 提示词架构 + 内容质量提升

## 问题现象

1. `generateMorningBriefing` / `generateEveningSummary` 完全绕过 v2 prompt 架构：
   - 不用 `buildSystemPrompt()` — 内联拼接 system prompt
   - 不用 `loadWarmContext()` — 散装调 repo
   - 不加载 briefing agent（`agents/briefing.md` 写了但没人用）
   - Soul/Profile 截断到 200 字，大部分人格信息丢失
   - 不加载 UserAgent — 用户通知偏好、规则不生效
   - 不加载 Memory — 问候缺乏上下文深度
   - 不加载 Wiki — 不知道用户最近关注什么
2. 早报只列待办，缺少「进行中目标」和目标进度
3. 晚报只列完成数和记录数，缺少「日记洞察」和「每日肯定」

## 修复目标

- 早晚报接入 `loadWarmContext(mode: "briefing")` + `buildSystemPrompt(agent: "briefing")`
- Soul 完整注入（不截断）
- UserAgent 的通知偏好生效
- Memory + Wiki 注入让内容更有深度

### 与 daily-report-core.md 的关系

本次修复是 **daily-report-core.md 第 2 阶段的部分落地**：
- daily-report-core 定义了完整的 `MorningReport` / `EveningReport` 接口（含 goal_progress、cognitive_highlights 等）
- 本次修复在现有 `BriefingResult` / `SummaryResult` 基础上**增量新增字段**，而非替换为 core 的完整 schema
- 新增字段命名保持向后兼容：旧字段不变，新字段缺失时前端用默认值
- 未来完整落地 core spec 时统一重命名（如 goal_pulse → goal_progress）

### 早报定位：面向未来，交代要做什么

| 数据 | 来源 | 用途 |
|------|------|------|
| 未完成待办 | `todoRepo.findPendingByUser` | 今日计划 + 逾期 |
| 进行中目标 | `goalRepo.findActiveByUser` | 目标脉搏（名称+待办进度） |
| Soul（完整） | `loadWarmContext` | AI 人格化问候 |
| Profile | `loadWarmContext` | 个性化称呼/语气 |
| Memory（最多 5 条） | `loadWarmContext` | 近期承诺/决定作为上下文 |
| UserAgent | `loadWarmContext` | 通知偏好（如用户关闭晨间简报则不生成） |

### 晚报定位：面向过去，洞察+肯定

| 数据 | 来源 | 用途 |
|------|------|------|
| 今日完成待办 | `todoRepo` 筛选 done+today | 成就列表 |
| 今日日记摘要 | `recordRepo.findByUserAndDateRange` + transcript | AI 洞察素材 |
| Soul（完整） | `loadWarmContext` | AI 人格化回顾 |
| Profile | `loadWarmContext` | 个性化 |
| Memory（最多 5 条） | `loadWarmContext` | 近期上下文 |
| Wiki（最多 3 条） | `loadWarmContext` | 知识关联 |

---

## 1. 早报重构

### 场景 1.1: 早报问候体现人格与上下文

```
假设 (Given)  用户有个人画像与近期记忆
当   (When)   用户打开晨间简报
那么 (Then)   问候内容自然体现用户人格特征
并且 (And)    问候展现了对近期上下文的感知
```

### 场景 1.2: 早报包含进行中目标

```
假设 (Given)  用户有进行中的目标以及关联待办
当   (When)   用户打开晨间简报
那么 (Then)   页面显示"目标脉搏"区域
并且 (And)    每个目标展示名称与待办完成进度
并且 (And)    今日焦点区域适当呼应目标进展
```

### 场景 1.3: 早报字段与排版

```
假设 (Given)  用户打开晨间简报
当   (When)   用户查看简报内容
那么 (Then)   页面包含问候、今日焦点、遗留、目标脉搏、昨日统计五个区域
并且 (And)    目标脉搏区域在用户无目标时显示为空
```

### 场景 1.4: 早报尊重通知偏好

```
假设 (Given)  用户将晨间简报通知设置为关闭
当   (When)   系统到达早报推送时间
那么 (Then)   用户不会收到早报推送通知
并且 (And)    用户仍可手动打开简报页面查看内容
```

---

## 2. 晚报重构

### 场景 2.1: 晚报体现人格与上下文

```
假设 (Given)  用户有画像与近期记忆/知识
当   (When)   用户打开晚间回顾
那么 (Then)   内容以用户人格的口吻呈现
并且 (And)    回顾自然关联近期承诺、决定与关注点
```

### 场景 2.2: 晚报包含日记洞察

```
假设 (Given)  用户今天写过日记
当   (When)   用户打开晚间回顾
那么 (Then)   页面展示基于今日日记的洞察段落
并且 (And)    洞察准确描述用户当日感受与状态
并且 (And)    洞察可指出更高层级的模式或有趣之处
```

### 场景 2.3: 晚报包含每日肯定

```
假设 (Given)  用户打开晚间回顾
当   (When)   用户查看回顾内容
那么 (Then)   页面显示一句真诚的每日肯定
并且 (And)    肯定内容基于当日实际活动
并且 (And)    当日无活动时，肯定语气体现温暖的接纳
```

### 场景 2.4: 晚报结构与字段

```
假设 (Given)  用户打开晚间回顾
当   (When)   用户查看回顾内容
那么 (Then)   页面包含标题、成就、洞察、每日肯定、明日预览五个区域
并且 (And)    洞察与每日肯定在无数据时显示为默认引导语
```

### 场景 2.5: 晚报尊重通知偏好

```
假设 (Given)  用户将晚间回顾通知设置为关闭
当   (When)   系统到达晚报推送时间
那么 (Then)   用户不会收到晚报推送通知
并且 (And)    用户仍可手动打开回顾页面查看内容
```

---

## 3. briefing agent 激活

### 场景 3.1: briefing 人格一致性

```
假设 (Given)  系统配置了 briefing 专属的人格引导
当   (When)   用户打开早报或晚报
那么 (Then)   报告内容语气与该人格保持一致
并且 (And)    同日早报与晚报之间的语气连贯
```

---

## 边界条件

- [ ] 新用户无目标 → goal_pulse 返回空数组
- [ ] 新用户无日记 → insight 返回"今天还没有记录，明天见"
- [ ] 新用户无待办 → today_focus 返回引导语
- [ ] Soul/Profile 为空 → 使用默认人格生成
- [ ] loadWarmContext 部分失败 → 降级到只用可用数据生成
- [ ] UserAgent 通知偏好检查失败 → 默认生成（不阻塞）
- [ ] 日记文本过长 → 截断到 2000 字
- [ ] AI 返回 JSON 缺少新字段 → 补充默认值（insight: "", affirmation: "", goal_pulse: []）
- [ ] 前端兼容性 → 新字段（goal_pulse/insight/affirmation）为增量添加，旧字段不变。前端组件用可选链访问新字段（如 `data.goal_pulse ?? []`），旧版客户端忽略未知字段不会崩溃
- [ ] 日记截断策略 → 按时间倒序排列，保留最新的日记，硬截断到 2000 字（不截断半句，以最后一个完整 record 为边界）
- [ ] UserAgent 通知偏好匹配 → 使用与 chat.ts 相同的 `isSkillEnabledInUserAgent` 模式（行级 includes 匹配），检查"晨间简报"/"晚间回顾"关键词 + "关闭"关键词

## 接口约定

### BriefingResult（更新后）

```typescript
interface BriefingResult {
  greeting: string;
  today_focus: string[];
  carry_over: string[];
  goal_pulse: Array<{ title: string; progress: string }>;  // 新增
  stats: { yesterday_done: number; yesterday_total: number };
}
```

### SummaryResult（更新后）

```typescript
interface SummaryResult {
  headline: string;
  accomplishments: string[];
  insight: string;         // 新增：日记洞察
  affirmation: string;     // 新增：每日肯定
  tomorrow_preview: string[];
  stats: { done: number; new_records: number };
}
```

## 验收行为（E2E 锚点）

### 行为 1: 晨间简报包含目标脉搏
- 用户登录并创建目标与若干待办
- 用户打开晨间简报
- 页面显示"目标脉搏"区域且内容不为空

### 行为 2: 晚间回顾包含日记洞察和肯定
- 用户提交当日日记并完成一个待办
- 用户打开晚间回顾
- 页面显示日记洞察段与每日肯定段，均非空

### 行为 3: 早晚报人格一致
- 用户打开早报，再打开晚报
- 两份报告的问候与标题语气均体现用户人格，不是公文腔

## 改动文件预估

- `gateway/src/handlers/daily-loop.ts` — 主要改动：接入 loadWarmContext + buildSystemPrompt + 加载目标/日记
- `gateway/src/handlers/daily-loop.test.ts` — 更新/新增测试
- `gateway/src/context/loader.ts` — 可能需要调整 briefing mode 下的 memory limit
- `e2e/prompt-architecture-v2.spec.ts` 或新建 `e2e/briefing-v2.spec.ts` — E2E 验收
