---
id: "fix-briefing-prompt-v2"
title: "Fix: 早晚报接入 v2 提示词架构 + 内容质量提升"
status: completed
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

### 场景 1.1: 早报接入 v2 prompt 架构

```
假设 (Given)  用户请求晨间简报
当   (When)   generateMorningBriefing 被调用
那么 (Then)   使用 loadWarmContext(mode: "briefing") 加载上下文
并且 (And)    使用 buildSystemPrompt(agent: "briefing") 构建 system prompt
并且 (And)    Soul 完整注入（不截断到 200 字）
并且 (And)    UserAgent 注入（用户规则/通知偏好）
并且 (And)    Memory 注入（最多 5 条相关记忆）
```

### 场景 1.2: 早报包含进行中目标

```
假设 (Given)  用户有 active/progressing 状态的目标
当   (When)   生成晨间简报
那么 (Then)   加载活跃目标列表（goalRepo.findActiveByUser）
并且 (And)    每个目标附带待办完成进度（done/total）
并且 (And)    prompt 的 user 消息中包含「目标脉搏」段落
并且 (And)    AI 在 today_focus 中适当引用目标进展
```

### 场景 1.3: 早报 JSON 输出格式

```
假设 (Given)  AI 生成早报
当   (When)   返回结果
那么 (Then)   JSON 结构为：
             {
               "greeting": "≤30字个性化问候",
               "today_focus": ["待办/目标相关，按优先级，最多5条"],
               "carry_over": ["逾期待办，语气轻松"],
               "goal_pulse": [{"title": "目标名", "progress": "2/5"}],
               "stats": {"yesterday_done": N, "yesterday_total": N}
             }
并且 (And)    新增 goal_pulse 字段
```

### 场景 1.4: 早报尊重 UserAgent 通知偏好

```
假设 (Given)  用户的 UserAgent 通知偏好中设置了"晨间简报: 关闭"
当   (When)   请求晨间简报
那么 (Then)   检查 UserAgent 通知偏好
并且 (And)    如果包含"晨间简报: 关闭" → 返回 null 或空结果，不调用 AI
并且 (And)    如果未设置或"开启" → 正常生成
```

---

## 2. 晚报重构

### 场景 2.1: 晚报接入 v2 prompt 架构

```
假设 (Given)  用户请求晚间回顾
当   (When)   generateEveningSummary 被调用
那么 (Then)   使用 loadWarmContext(mode: "briefing") 加载上下文
并且 (And)    使用 buildSystemPrompt(agent: "briefing") 构建 system prompt
并且 (And)    Soul/Profile/Memory/Wiki 完整注入
```

### 场景 2.2: 晚报包含日记洞察

```
假设 (Given)  用户今天有日记记录（record + transcript）
当   (When)   生成晚间回顾
那么 (Then)   加载今日日记（recordRepo.findByUserAndDateRange + transcriptRepo.findByRecordIds）
并且 (And)    将日记文本（最多 2000 字）传入 prompt 的 user 消息
并且 (And)    AI 对日记进行洞察：
             - 准确描述用户今天的感受和状态（不是泛泛总结）
             - 抽象出更高层级的模式/趋势（如"你最近三天都在纠结同一件事"）
             - 如果有矛盾或有趣的点，指出来
并且 (And)    输出在 JSON 的 insight 字段
```

### 场景 2.3: 晚报包含每日肯定

```
假设 (Given)  AI 生成晚间回顾
当   (When)   返回结果
那么 (Then)   JSON 包含 affirmation 字段
并且 (And)    affirmation 是一句真诚的肯定：
             - 基于今天实际做的事（不是空洞的"你很棒"）
             - 如果什么都没做 → "今天休息也是一种选择" 类型的接纳
             - 语气匹配 Soul 人格（温暖但不虚伪）
```

### 场景 2.4: 晚报 JSON 输出格式

```
假设 (Given)  AI 生成晚报
当   (When)   返回结果
那么 (Then)   JSON 结构为：
             {
               "headline": "≤30字温暖回顾",
               "accomplishments": ["具体完成的事项"],
               "insight": "日记洞察 — 准确描述+高阶抽象，2-4句话",
               "affirmation": "一句真诚的每日肯定",
               "tomorrow_preview": ["明日排期，最多3条"],
               "stats": {"done": N, "new_records": N}
             }
并且 (And)    新增 insight 和 affirmation 字段
```

### 场景 2.5: 晚报尊重 UserAgent 通知偏好

```
假设 (Given)  用户的 UserAgent 通知偏好中设置了"晚间回顾: 关闭"
当   (When)   请求晚间回顾
那么 (Then)   检查 UserAgent 通知偏好
并且 (And)    如果包含"晚间回顾: 关闭" → 返回 null，不调用 AI
```

---

## 3. briefing agent 激活

### 场景 3.1: briefing.md 正确注入

```
假设 (Given)  agents/briefing.md 已存在
当   (When)   buildSystemPrompt(agent: "briefing") 被调用
那么 (Then)   briefing agent prompt 被注入到 SharedAgent 之后
并且 (And)    prompt 组装顺序遵循 v2 标准：SharedAgent → briefing.md → DateAnchor → Soul → UserAgent → Profile → Memory → Wiki
             （briefing.md 在位置 2 注入是 buildSystemPrompt 对 agent 参数的标准处理，见 prompt-builder.ts 行 82-84）
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

### E2E-1: 晨间简报包含目标脉搏
- 登录 → 创建目标 + 若干待办 → GET /api/v1/daily/briefing?forceRefresh=true
- 响应包含 goal_pulse 数组，且不为空

### E2E-2: 晚间回顾包含日记洞察和肯定
- 登录 → 提交日记 → 完成一个待办 → GET /api/v1/daily/evening-summary?forceRefresh=true
- 响应包含 insight（非空字符串）和 affirmation（非空字符串）

### E2E-3: 早晚报人格一致
- 生成早报和晚报 → 两者的 greeting/headline 语气应体现 Soul 人格（非公文腔）

## 改动文件预估

- `gateway/src/handlers/daily-loop.ts` — 主要改动：接入 loadWarmContext + buildSystemPrompt + 加载目标/日记
- `gateway/src/handlers/daily-loop.test.ts` — 更新/新增测试
- `gateway/src/context/loader.ts` — 可能需要调整 briefing mode 下的 memory limit
- `e2e/prompt-architecture-v2.spec.ts` 或新建 `e2e/briefing-v2.spec.ts` — E2E 验收
