---
id: "091"
title: "系统提示词重构：多 Agent + Skill 架构"
status: completed
domain: agent
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-31
---
# 系统提示词重构：多 Agent + Skill 架构

> 状态：✅ 已完成

## 概述
将单一 AGENTS.md 拆分为共享基座 + 角色化 Agent，用 Skill 承载深度场景（复盘、洞察、待办拆解）。核心原则：**如非必要，不增加复杂度**——能用 chat agent + skill 解决的不新建 agent。

Agent 只有 3 个：chat（主力，覆盖聊天/复盘/洞察/决策/行动）、briefing（报告，非聊天界面）、onboarding（引导）。

Skill 触发方式（混合模式 C）：前端显式选择 + 聊天 `/` 快捷键 + AI 自动识别，三条路径同一套加载逻辑。

---

## Part A: Agent 架构

### 场景 A1: 启动时加载 Agent 文件
```
假设 (Given)  gateway/agents/ 目录下有 chat.md, briefing.md, onboarding.md
当   (When)   gateway 服务启动
那么 (Then)   prompt-builder 读取 AGENTS.md（基座）+ 3 个 agent 文件到内存
并且 (And)    console 输出确认加载成功
```

### 场景 A2: Agent 文件缺失降级
```
假设 (Given)  某个 agent 文件不存在或读取失败
当   (When)   gateway 服务启动
那么 (Then)   该 agent 标记为空，不阻塞启动
并且 (And)    使用该 agent 的场景仅注入基座（退化为当前行为）
```

---

## Part B: AGENTS.md 瘦身

### 场景 B1: 基座只保留共享规则
```
假设 (Given)  现有 AGENTS.md 包含 121 行
当   (When)   完成瘦身
那么 (Then)   只保留：核心使命、安全规则、对话纪律、简报纪律、绝对禁止
并且 (And)    移除的内容（沟通风格、场景指南、技能路由、主动巡检）已迁入 agent/skill
并且 (And)    瘦身后约 60 行
```

---

## Part C: Skill 触发（三条路径）

### 场景 C1: 前端显式 — text-bottom-sheet `/` 打开技能面板
```
假设 (Given)  用户在 text-bottom-sheet 输入框中输入 "/"
当   (When)   检测到 "/" 输入
那么 (Then)   不再进入旧的 command mode 聊天
而是 (Instead) 弹出技能选择面板，列出可用 skill：
              - 复盘（review-guide）
              - 拆解待办（todo-management）
              - 芒格视角（munger-review）
              - 元问题（meta-question）
              - 二阶思考（second-order-thinking）
              - ...（所有已启用的 skill/insight）
并且 (And)    用户选择后，以 skill 参数进入 ChatView
```

### 场景 C2: 聊天显式 — chat 输入框 `/` 快捷激活 skill
```
假设 (Given)  用户已在聊天界面中
当   (When)   用户在 chat 输入框中输入 "/" 开头的文本
那么 (Then)   显示匹配的 skill 建议列表（chip 形式）
      例如    输入 "/复" → 显示 "复盘" chip
              输入 "/拆" → 显示 "拆解待办" chip
              输入 "/" 单独 → 显示所有可用 skill chip
并且 (And)    用户点击 chip 或回车 → 激活该 skill
并且 (And)    skill 注入当前会话的 system prompt（追加到 warm tier）
并且 (And)    如果 "/" 后跟了额外文字（如 "/拆解 项目A"），"项目A" 作为上下文传给 AI
```

### 场景 C3: AI 自动路由 — 关键词匹配隐式激活 skill
```
假设 (Given)  用户在聊天中发送普通消息（不以 "/" 开头）
      并且    消息匹配 skill 路由关键词
当   (When)   gateway 收到消息
那么 (Then)   用关键词规则预筛（零 AI 调用成本）：
              - /帮我复盘|回顾一下|总结这周/ → 激活 review-guide
              - /帮我拆解|拆成待办|分解.*任务/ → 激活 todo-management
              - /芒格|决策复盘/ → 激活 munger-review
              - /深入想想|二阶思考/ → 激活 second-order-thinking
              - /帮我分析|元问题/ → 激活 meta-question
并且 (And)    匹配到 skill 后，动态注入该 skill prompt 到当前会话
并且 (And)    未匹配到 → 正常聊天，不激活任何 skill
```

### 场景 C4: 三条路径统一加载逻辑
```
假设 (Given)  skill 通过以上任一路径被触发
当   (When)   需要将 skill 注入 session
那么 (Then)   统一调用同一个 skill 加载函数：
              1. 根据 skill name 找到对应 SKILL.md
              2. 将 skill prompt 追加到 session context 的 warm tier
              3. 如果 skill 需要深度输出（review-guide, insight 类），tier 升级为 "chat"
并且 (And)    一个会话中同一时间只激活一个 skill（后激活的替换前一个）
```

---

## Part D: Mode 路由

### 场景 D1: 命令/聊天/问候 → chat agent（无 skill）
```
假设 (Given)  用户通过路路图标进入聊天（mode="command"，无 initialMessage）
当   (When)   startChat 构建 system prompt
那么 (Then)   system prompt = 基座 + agents/chat.md + soul/profile/memory
并且 (And)    无 skill 激活（等用户对话中触发）
```

### 场景 D2: 复盘模式 → chat agent + review-guide skill（自动加载）
```
假设 (Given)  用户进入复盘模式（mode="review"）
当   (When)   startChat 构建 system prompt
那么 (Then)   system prompt = 基座 + agents/chat.md + review-guide skill + soul/profile/memory
并且 (And)    使用 tier="chat"（推理模型）
```

### 场景 D3: 洞察模式 → chat agent + 用户选的 insight skill
```
假设 (Given)  用户进入洞察模式（mode="insight"）并选择了视角
当   (When)   startChat 构建 system prompt
那么 (Then)   system prompt = 基座 + agents/chat.md + 选中 insight skill + soul/profile/memory
并且 (And)    使用 tier="chat"（推理模型）
```

### 场景 D4: 决策模式 → 现有 decision.ts 行为不变
```
假设 (Given)  用户进入决策模式（mode="decision"）
当   (When)   startChat 构建 system prompt
那么 (Then)   先加载基座 + chat agent，然后被 decision.ts 覆盖
并且 (And)    现有行为不变
```

### 场景 D5: 前端带 skill 参数进入聊天
```
假设 (Given)  用户从技能面板选择了 skill（如 review-guide）进入 ChatView
当   (When)   startChat 收到 skill 参数
那么 (Then)   system prompt = 基座 + agents/chat.md + 指定 skill + soul/profile/memory
并且 (And)    skill 需要深度输出时 tier 升级为 "chat"
```

---

## Part E: 待办拆解工作流（todo-management skill 核心）

### 场景 E1: 用户请求拆解项目 → AI 先问关键问题
```
假设 (Given)  用户在聊天中说"帮我把项目A拆解成待办"
      并且    todo-management skill 已激活（自动或手动）
当   (When)   AI 识别到拆解意图
那么 (Then)   AI 先提出 3-5 个关键问题：
              - 这个项目的目标/交付物是什么？
              - 你手头有什么资源？（时间、预算、工具）
              - 截止时间是什么时候？有哪些关键节点？
              - 是你一个人做还是团队协作？
              - 如果是团队：你负责哪些部分？
并且 (And)    不直接开始拆解，等用户回答后再继续
```

### 场景 E2: 用户回答后 → AI 输出方案（markdown 格式）
```
假设 (Given)  用户已回答关键问题
当   (When)   AI 整合信息开始拆解
那么 (Then)   AI 输出 markdown 格式的拆解方案，包含：
              - 项目概览（一句话）
              - 分阶段待办列表（每条：任务+时间+验证标准）
              - 如果是团队协作：只列出用户自己的待办，团队成员的部分标为"等待接口"
              - 风险/依赖提示
并且 (And)    方案结尾明确询问"这个方案可以吗？需要调整哪里？"
并且 (And)    不直接调用 create_todo 工具
```

### 场景 E3: 用户确认方案 → 批量创建待办
```
假设 (Given)  AI 已输出拆解方案
      并且    用户回复确认（"可以"/"好的"/"没问题"等）
当   (When)   AI 收到确认
那么 (Then)   AI 调用 create_todo 工具逐条创建待办
并且 (And)    每条待办包含：text + scheduled_start（如有）+ priority
并且 (And)    创建完成后汇报："已创建 N 条待办"
```

### 场景 E4: 用户要求修改方案
```
假设 (Given)  AI 已输出拆解方案
      并且    用户要求修改（"第3条去掉"/"时间改到下周"等）
当   (When)   AI 收到修改请求
那么 (Then)   AI 输出修改后的方案（仍为 markdown 格式）
并且 (And)    再次询问确认
并且 (And)    不调用创建工具，直到用户确认
```

---

## Part F: 复盘引导 Skill（深度输出）

### 场景 F1: 复盘 skill 引导 1000-2000 字深度输出
```
假设 (Given)  review-guide skill 已加载
      并且    用户进入复盘模式或在聊天中触发复盘
当   (When)   AI 基于日记数据进行复盘
那么 (Then)   AI 输出 1000-2000 字的深度复盘，包含：
              第一步：事实回顾（基于日记/待办数据）
              第二步：多视角分析（从用户选择或默认的哲学框架出发）
              第三步：洞察与发现（想法演进、模式识别、盲点）
              第四步：下一步实验（具体、可验证、本周内可做）
并且 (And)    引用具体日记内容（不泛泛而谈）
并且 (And)    使用 tier="chat"（推理模型）确保深度
```

### 场景 F2: 复盘支持多哲学视角
```
假设 (Given)  review-guide skill 已加载
当   (When)   用户选择或系统默认使用某个分析视角
那么 (Then)   skill 支持以下视角（可组合）：
              - 芒格：反转思考 + 多模型思维
              - 马克思：矛盾分析 + 系统性视角
              - 孙子：知己知彼 + 势与时
              - 老子：无为 + 自然 + 对立统一
              - 乔布斯：用户体验 + 极简 + 连点成线
并且 (And)    默认至少使用 2 个视角进行交叉分析
```

---

## Part G: 报告 Agent（独立设计）

### 场景 G1: 晨间简报使用 briefing agent
```
假设 (Given)  daily-loop 触发晨间简报生成
当   (When)   构建 AI prompt
那么 (Then)   使用 agents/briefing.md 中的专用提示词
并且 (And)    聚焦行动：今日待办、目标进展、逾期提醒
并且 (And)    格式：结构化 JSON（非对话式）
并且 (And)    tier="report"
```

### 场景 G2: 晚间回顾使用 briefing agent
```
假设 (Given)  daily-loop 触发晚间回顾生成
当   (When)   构建 AI prompt
那么 (Then)   使用 agents/briefing.md 中的专用提示词
并且 (And)    聚焦回顾：完成了什么 + 认知收获 + 明日预告
并且 (And)    认知部分用温暖语言（不用技术术语）
并且 (And)    tier="report"
```

---

## Part H: Tier 修复

### 场景 H1: 反思追问使用 fast tier
```
假设 (Given)  用户写完日记，触发 generateReflection
当   (When)   AI 生成 15-30 字追问
那么 (Then)   tier="fast"（原为 "report"）
```

### 场景 H2: AI 状态消息使用 fast tier
```
假设 (Given)  前端请求 AI 状态消息
当   (When)   generateAiStatus 被调用
那么 (Then)   tier="fast"（原为 "report"）
```

---

## 边界条件
- [ ] 基座为空/损坏：使用 hardcoded fallback
- [ ] 所有 agent 文件缺失：退化为当前行为
- [ ] mode 不在路由表：默认 chat agent
- [ ] 待办拆解中用户中途离开：不创建任何待办
- [ ] 复盘日记数据为空：降级为简短问候式复盘，不强行凑字数
- [ ] 同时加载 chat agent + skill：两者都注入，不冲突
- [ ] 聊天中 "/" 后输入不匹配任何 skill：作为普通消息发送
- [ ] text-bottom-sheet "/" 打开面板后用户取消：回到输入状态，不进聊天
- [ ] AI 自动路由误判：只用高置信度关键词，宁可漏判不误判

---

## 接口约定

### AgentRole 类型
```typescript
// gateway/src/context/tiers.ts
export type AgentRole = "chat" | "briefing" | "onboarding";
```

### ContextBuildOptions 扩展
```typescript
export interface ContextBuildOptions {
  mode: ContextMode;
  skills: Skill[];
  soul?: string;
  userProfile?: string;
  memories?: string[];
  mcpTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  agent?: AgentRole;  // 新增
}
```

### ChatStartPayload 扩展
```typescript
export interface ChatStartPayload {
  // ...existing fields...
  /** 前端显式指定的 skill（从技能面板或 "/skill" 触发） */
  skill?: string;
}
```

### Skill 自动路由关键词表
```typescript
// gateway/src/handlers/chat.ts
const SKILL_ROUTE_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /帮我复盘|回顾一下|总结这[周月]/, skill: "review-guide" },
  { pattern: /帮我拆解|拆成待办|分解.*任务|拆.*项目/, skill: "todo-management" },
  { pattern: /芒格|决策复盘/, skill: "munger-review" },
  { pattern: /深入想想|二阶思考/, skill: "second-order-thinking" },
  { pattern: /帮我分析一下|元问题/, skill: "meta-question" },
];
```

### Skill 深度标记
```typescript
// 需要深度输出的 skill → 自动升级到 chat tier
const DEEP_SKILLS = new Set([
  "review-guide", "munger-review", "meta-question", "second-order-thinking",
]);
```

---

## 文件清单

### 新建文件（5个）
| 文件 | 说明 |
|------|------|
| `gateway/agents/chat.md` | 对话陪伴（主力 agent） |
| `gateway/agents/briefing.md` | 简报秘书（结构化报告） |
| `gateway/agents/onboarding.md` | 引导员（参考文档） |
| `gateway/skills/todo-management/SKILL.md` | 待办拆解工作流 |
| `gateway/insights/review-guide/SKILL.md` | 复盘引导（深度+多视角） |

### 修改文件 — 后端（5个）
| 文件 | 改动 |
|------|------|
| `gateway/AGENTS.md` | 瘦身至~60行 |
| `gateway/src/context/tiers.ts` | 加 AgentRole + agent 字段 |
| `gateway/src/skills/prompt-builder.ts` | 加载 agents，按 role 注入 hot tier |
| `gateway/src/handlers/chat.ts` | agent 路由 + skill 触发（关键词自动路由 + skill 参数支持） |
| `gateway/src/handlers/reflect.ts` | tier "report" → "fast"（2处） |

### 修改文件 — 前端（3个）
| 文件 | 改动 |
|------|------|
| `features/recording/components/text-bottom-sheet.tsx` | "/" 改为打开技能面板（不再进 command mode） |
| `features/chat/components/chat-view.tsx` | chat 输入框 "/" 显示 skill 建议 chip |
| `features/chat/hooks/use-chat.ts` | 支持 skill 参数传递给 gateway |

### 不动的文件
- `gateway/src/handlers/digest-prompt.ts`（最近改过）
- `gateway/src/handlers/process.ts`（最近改过）
- `gateway/src/handlers/process-prompt.ts`
- `gateway/src/cognitive/batch-analyze-prompt.ts`
- `gateway/src/handlers/daily-loop.ts`（自有 prompt，briefing.md 作为参考）
- `gateway/src/handlers/onboarding-prompt.ts`（自有 prompt）

---

## 依赖
- `gateway/src/skills/prompt-builder.ts` — 核心加载逻辑
- `gateway/src/context/tiers.ts` — 类型定义
- `gateway/src/handlers/chat.ts` — 路由 + skill 触发
- `gateway/src/skills/loader.ts` — 现有 skill 加载机制（不改）
- `features/commands/lib/registry.ts` — 现有命令注册表（skill 面板可复用）

## 备注
- 复盘 = chat agent + review-guide skill（不单独建 agent）
- 洞察 = chat agent + 用户选的 insight skill（不单独建 agent）
- 决策 = chat agent + decision.ts 覆盖（不单独建 agent）
- briefing agent 独立于聊天界面，专为结构化报告设计
- onboarding agent 作为参考文档，onboarding-prompt.ts 暂不接入
- todo-management skill 核心是**工作流**（问→方案→确认→创建）
- 复盘/洞察深度输出 1000-2000 字，必须用 chat tier（推理模型）
- text-bottom-sheet "/" 从 command mode 入口改为**技能面板**入口
- chat "/" 保留为 skill 快捷键（类似 Slack/Discord）
- AI 自动路由用关键词规则（零成本），宁可漏判不误判
