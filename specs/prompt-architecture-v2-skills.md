---
id: "prompt-architecture-v2-skills"
title: "提示词架构 v2 — 工具 / Skill / 组装 / 实施阶段"
status: completed
domain: agent
risk: high
dependencies: ["cognitive-wiki.md", "chat-system.md", "agent-tool-layer.md", "prompt-architecture-v2-layers.md"]
created: 2026-04-17
updated: 2026-04-17
---

# 提示词架构 v2 — 工具 / Skill / 组装 / 实施阶段

> 本文件为 `prompt-architecture-v2.md` 拆分后的「工具与组装」子域。
> 另见 `prompt-architecture-v2-layers.md` — SharedAgent / UserAgent / 五层存储互斥边界 / endChat 重构。

## 5. 自我维护工具定义

### 场景 5.1: update_soul 工具

```
假设 (Given)  AI 判断用户在对 AI 做身份定义
当   (When)   AI 调用 update_soul 工具
那么 (Then)   工具接收 { instruction: string } 参数
             instruction 为用户对 AI 的指令摘要（如"用户希望 AI 简洁直接"）
并且 (And)    工具内部：加载现有 Soul → AI 合成更新后内容 → 写入 DB
并且 (And)    autonomy: "silent"
并且 (And)    复用现有 soul/manager.ts 的合成逻辑
```

### 场景 5.2: update_profile 工具

```
假设 (Given)  AI 判断用户透露了持久性身份信息
当   (When)   AI 调用 update_profile 工具
那么 (Then)   工具接收 { facts: string } 参数
             facts 为提取的用户事实（如"用户是产品经理，在XXX公司"）
并且 (And)    工具内部：加载现有 Profile → AI 合成更新后内容 → 写入 DB
并且 (And)    autonomy: "silent"
并且 (And)    复用现有 profile/manager.ts 的合成逻辑
```

### 场景 5.3: update_user_agent 工具

```
假设 (Given)  AI 观察到有效的交互模式或用户反馈
当   (When)   AI 调用 update_user_agent 工具
那么 (Then)   工具接收 { rule: string, reason: string } 参数
             rule 为新增/修改的交互规则
             reason 为观察依据
并且 (And)    工具内部：加载现有 UserAgent → 追加到"个性化规则"段落 → 写入 DB
并且 (And)    autonomy: "silent"
并且 (And)    规则格式为 "- {rule}（{日期} {reason}）"
```

### 场景 5.4: create_memory 工具

```
假设 (Given)  AI 判断用户提到了值得记录的时间点信息
当   (When)   AI 调用 create_memory 工具
那么 (Then)   工具接收 { content: string, importance: number } 参数
并且 (And)    工具内部：复用 MemoryManager.maybeCreateMemory 的 ADD 逻辑
并且 (And)    跳过两阶段 AI 判断（调用方 AI 已完成判断）
并且 (And)    autonomy: "silent"
```

### 场景 5.5: update_user_info 从 AI 工具列表移除

```
假设 (Given)  现有 update_user_info 工具同时注册为 AI 可调用工具和前端 API
并且 (And)    新增了 update_soul / update_profile 两个更精细的 AI 工具
当   (When)   重构完成后
那么 (Then)   update_user_info 从 ToolRegistry 移除（AI 对话中不再可调用）
并且 (And)    update_user_info 仅保留前端直接入口（由前端路由直接触发，不经过 AI 工具层）
并且 (And)    AI 对话中只使用 update_soul / update_profile / update_user_agent / create_memory
并且 (And)    SharedAgent 自我维护说明中不提及 update_user_info
```

### 场景 5.6: send_notification 工具

```
假设 (Given)  AI 判断需要主动向用户发送一条通知
当   (When)   AI 调用 send_notification 工具
那么 (Then)   工具接收 { title: string, body: string, action?: string } 参数
             title: 通知标题（如"路路想你了"）
             body: 通知正文（简短，1-2句话）
             action: 可选，点击后的跳转（如"chat"打开对话，"todo"打开待办）
并且 (And)    工具通过 Capacitor Local Notifications（原生）或 Web Push 发送
并且 (And)    autonomy: "notify"（用户可见有通知发出）
并且 (And)    频率限制：每个用户每天最多 3 条主动通知
             （定时简报不算在内，由 daily-loop 独立发送）
并且 (And)    用户可在 UserAgent 通知偏好中关闭主动问候
```

---

## 5b. Skill 重构 — 全部默认关闭

> 当前 skills 和 insights 加载时 `enabled: true`，所有技能默认启用。
> 重构后：所有技能默认关闭，用户在 UserAgent 技能配置中显式开启后才可用。

### 场景 5b.1: Skill 默认关闭

```
假设 (Given)  gateway/skills/ 和 gateway/insights/ 下有多个内置技能
当   (When)   loadSkills() 加载技能列表
那么 (Then)   所有技能的 enabled 默认为 false（而非当前的 true）
并且 (And)    技能要生效，必须满足以下任一条件：
             a. 用户在 UserAgent 技能配置中显式开启
             b. 用户在对话中通过 "/skill:xxx" 显式激活（一次性）
             c. 前端 payload.skill 显式指定
```

### 场景 5b.2: Skill 激活判断流程

```
假设 (Given)  initChat 或 sendChatMessage 需要判断是否激活 skill
当   (When)   检查 skill 可用性
那么 (Then)   判断优先级：
             1. payload.skill（前端显式指定）→ 直接激活，无论 UserAgent 配置
             2. "/skill:xxx" 指令（对话中触发）→ 一次性激活，不写入 UserAgent
             3. 自动路由（SKILL_ROUTE_PATTERNS 关键词匹配）→ 仅当 UserAgent 技能配置中该 skill 为"开启"时才激活
             4. mode="review" 自动加载 → 仅当 UserAgent 中 review-guide 为"开启"时
并且 (And)    如果 skill 未开启但用户的消息命中了自动路由关键词 →
             AI 不激活该 skill，但可在回复中提示"你可以开启 XX 技能来获得更好的体验"
```

### 场景 5b.3: 技能开启/关闭通过 UserAgent 工具

```
假设 (Given)  用户说"帮我开启芒格复盘"或"我要用二阶思考"
当   (When)   AI 判断用户想开启某个技能
那么 (Then)   AI 调用 update_user_agent 工具
             section: "技能配置"
             rule: "munger-review: 开启（说'芒格复盘'时激活）"
并且 (And)    后续自动路由匹配到该关键词时，skill 才会被激活
```

### 场景 5b.4: 技能列表展示

```
假设 (Given)  用户问"有什么技能可以用"或前端展示技能列表
当   (When)   系统返回技能清单
那么 (Then)   返回所有技能的 name + description + 当前状态（开启/关闭）
并且 (And)    状态从 UserAgent 技能配置段落中读取
并且 (And)    未在 UserAgent 中出现的技能默认为"关闭"
```

### 场景 5b.5: 现有技能清单（全部默认关闭）

```
假设 (Given)  系统已部署以下技能
当   (When)   列出全部可用技能
那么 (Then)   展示以下清单（全部默认关闭）：
```

| 技能名 | 目录 | 类型 | 描述 |
|-------|------|------|------|
| todo-management | skills/ | 工具链 | 待办拆解和规划 |
| todo-extract | skills/ | 工具链 | 从文本中提取待办 |
| customer-request | skills/ | 工具链 | 客户需求处理 |
| setting-change | skills/ | 工具链 | 设置变更 |
| review-guide | insights/ | 深度推理 | 复盘引导 |
| munger-review | insights/ | 深度推理 | 芒格决策复盘 |
| meta-question | insights/ | 深度推理 | 元问题分析 |
| second-order-thinking | insights/ | 深度推理 | 二阶思考 |
| reflect | insights/ | 深度推理 | 反思引导 |

---

## 6. System Prompt 组装重构

### 场景 6.1: 新的组装顺序

```
假设 (Given)  prompt-builder.ts 需要重构组装逻辑
当   (When)   buildSystemPrompt 被调用
那么 (Then)   按以下顺序组装 system prompt：
             1. SharedAgent       — 静态基座（安全规则 + 工具规则 + 自我维护说明）
             2. 时间锚点          — buildDateAnchor()
             3. ## 灵魂            — Soul（AI 的人格文档，核心身份 + 风格 + 策略）
             4. ## 用户规则        — UserAgent（用户自定义的规则/流程/配置）
             5. ## 用户画像        — Profile（AI 自动提取的用户事实）
             6. ## 相关记忆        — Memory（按相关性检索，最多 15 条）
             7. ## 相关知识        — Wiki（按相关性检索，最多 5 条）
             8. ## 用户思考动态     — 从 Wiki 查询的认知上下文（替代 strike）
             9. ## 待确认意图       — pending_intent（保留现有逻辑）
            10. ## 激活的技能       — Skill prompt（保留现有逻辑）
            11. ## 外部工具（MCP）  — MCP 工具描述（保留现有逻辑）

注意组装顺序的意义：
- Soul 在 UserAgent 前面——AI 的人格优先于用户的规则配置
- Soul 紧跟 SharedAgent——先确立"我是谁"再接受任务
- Profile 在 Memory 前面——先知道用户是谁，再看发生了什么
```

### 场景 6.2: Wiki 上下文注入（修复当前缺失）

```
假设 (Given)  当前 loadWarmContext 已加载 wikiContext 但未注入 system prompt
当   (When)   重构完成后
那么 (Then)   buildSystemPrompt 新增 wikiContext 参数
并且 (And)    wikiContext 格式为 "## 相关知识\n" + 每条 "- {title}: {summary}"
并且 (And)    插入位置在 Memory 之后、认知上下文之前
```

### 场景 6.3: 认知上下文从 strike 迁移到 wiki（loadChatCognitive）

```
假设 (Given)  当前 advisor-context.ts 的 loadChatCognitive 查询 strike + bond 表
当   (When)   重构完成后
那么 (Then)   loadChatCognitive 改为查询 wiki_page 表
并且 (And)    "用户近期关注主题" 来自 wiki_page 的最近更新页面
             （按 compiled_at DESC 排序，取 top 3，返回 title + summary）
并且 (And)    "近期思考变化" 来自 wiki_page content 中的矛盾/变化描述
             （wiki 编译时已标注，如"之前认为A，后来转变为B"的段落）
并且 (And)    不再查询 strike/bond 表
并且 (And)    输出格式保持不变（## 标题 + 条目列表）
```

注意："相关知识"（场景 6.2）和"用户思考动态"（本场景）数据源都是 wiki_page，但查询逻辑不同：
- 场景 6.2 的 wikiContext：按用户输入文本做**关键词/向量匹配**（loadWikiContext）
- 本场景的 cognitiveContext：按**最近编译时间**取 top 页面 + 矛盾段落（loadChatCognitive）

### 场景 6.4: buildGoalDiscussionContext 和 buildInsightDiscussionContext 迁移

```
假设 (Given)  当前 advisor-context.ts 中：
             - buildGoalDiscussionContext 通过 goal.cluster_id 查 strike/bond
             - buildInsightDiscussionContext 通过 bondId 查矛盾双方 strike
当   (When)   重构完成后
那么 (Then)   buildGoalDiscussionContext 改为：
             - 通过 goal_id 查关联的 wiki_page（wiki_page 可能在编译时关联了 goal）
             - 如果无关联 wiki_page，回退到查 wiki_page 关键词搜索 goal.title
             - 矛盾/不同看法从 wiki_page content 中提取（已由编译引擎标注）
并且 (And)    buildInsightDiscussionContext 改为：
             - 接收 wiki_page_id 而非 bondId
             - 从 wiki_page content 中提取矛盾段落和相关思考
并且 (And)    如果 wiki_page 表为空（新用户），两个函数返回空上下文字符串
```

### 场景 6.5: prefetchDeepSkillContext 认知报告迁移

```
假设 (Given)  当前 prefetchDeepSkillContext 调用 generateCognitiveReport
             查询 strike 极性统计（perceive/judge/realize/intend/feel）和 cluster_changes
当   (When)   重构完成后
那么 (Then)   "认知动态"段落改为从 wiki_page 加载：
             - 最近 7 天更新的 wiki_page 标题列表（替代 cluster_changes）
             - wiki_page 中标注的矛盾/变化段落（替代 contradictions）
并且 (And)    移除 generateCognitiveReport 的 strike 极性统计
             （极性分布是 strike 模型的概念，wiki 模型不再使用）
并且 (And)    如果 wiki 表为空，"认知动态"段落返回空字符串（跳过）
```

---

## 7. Context Loader 重构

### 场景 7.1: loadWarmContext 新增 UserAgent 加载

```
假设 (Given)  context/loader.ts 的 loadWarmContext 函数
当   (When)   重构后
那么 (Then)   LoadedContext 接口新增 userAgent?: string 字段
并且 (And)    并行加载中新增 loadUserAgentSafe(userId) 调用
并且 (And)    如果 userId 不存在（未登录），返回默认模板
```

### 场景 7.2: loadWarmContext 返回 wikiContext（已有，确保传递）

```
假设 (Given)  loadWarmContext 已返回 wikiContext
当   (When)   chat.ts initChat 调用 buildSystemPrompt
那么 (Then)   将 loaded.wikiContext 传入 buildSystemPrompt
并且 (And)    buildSystemPrompt 新增 wikiContext 参数处理
```

---

## 8. 文件拆分

### 场景 8.1: AGENTS.md → SHARED_AGENT.md

```
假设 (Given)  当前 AGENTS.md 混合了共享规则和人格定义
当   (When)   重构完成后
那么 (Then)   AGENTS.md 重命名为 SHARED_AGENT.md
并且 (And)    移入 chat.md 的工具使用规则段落
并且 (And)    移入自我维护工具使用说明(场景 1.2)
并且 (And)    移除所有人格/风格描述（已移入 UserAgent 模板）
并且 (And)    移除节奏感知表（已移入 UserAgent 模板）
并且 (And)    prompt-builder.ts 更新文件读取路径
```

### 场景 8.2: agents/chat.md 删除

```
假设 (Given)  chat.md 的内容已拆分到 SHARED_AGENT.md 和 UserAgent 模板
当   (When)   重构完成后
那么 (Then)   agents/chat.md 文件删除
并且 (And)    prompt-builder.ts 的 agentFileMap 中移除 chat 条目
并且 (And)    UserAgent 模板存储在代码中（如 user-agent/template.ts 或 user-agent/template.md）
```

---

## 边界条件

- [ ] 未登录用户（无 userId）：UserAgent 使用默认模板（不从 DB 加载），Soul/Profile 按 deviceId 回退
- [ ] UserAgent 为空或损坏：回退到默认模板
- [ ] Soul 为空：system prompt 中跳过 "## AI 身份" 段落（当前行为不变）
- [ ] Profile 为空：system prompt 中跳过 "## 用户画像" 段落（当前行为不变）
- [ ] Wiki 上下文为空（新用户无编译数据）：跳过 "## 相关知识" 段落，认知上下文也跳过（不回退到 strike/bond）
- [ ] AI 在一次对话中频繁调用自我维护工具：SharedAgent 中不设硬限制，依赖 AI 自身判断
- [ ] 自我维护工具调用失败：静默失败，不影响对话流
- [ ] AI 快速连续调用 update_soul 和 update_profile：两个工具操作不同表，无竞态。同一工具连续调用依赖现有的 per-user 串行化队列（updateQueues）
- [ ] 迁移期间 strike 数据仍存在：advisor-context 切换到 wiki 后，strike 查询代码可安全移除
- [ ] agents/briefing.md 和 agents/onboarding.md 保持不变（不受此次重构影响）
- [ ] chat.ts initChat 调用 buildSystemPrompt 时移除 `agent: "chat"` 参数（chat 角色已由 UserAgent 替代）

## 接口约定

### user_agent 表

```typescript
interface UserAgent {
  id: string;
  user_id: string;
  content: string;           // markdown 格式的交互规则
  template_version: number;  // 模板版本，用于未来升级
  created_at: string;
  updated_at: string;
}
```

### update_user_agent 工具参数

```typescript
interface UpdateUserAgentParams {
  section: "我的规则" | "我的流程偏好" | "技能配置" | "通知偏好";
  rule: string;    // 新增/修改的规则
}
```

### update_soul 工具参数

```typescript
interface UpdateSoulParams {
  section: string;      // 要更新的 Soul 段落（如"我的性格""我如何和你说话"）
  content: string;      // 更新内容（AI 合成后的完整段落内容）
}
```

### send_notification 工具参数

```typescript
interface SendNotificationParams {
  title: string;         // 通知标题
  body: string;          // 通知正文（简短）
  action?: string;       // 点击跳转：'chat' | 'todo' | 'diary'
}
```

### update_profile 工具参数

```typescript
interface UpdateProfileParams {
  facts: string;  // 提取的用户事实
}
```

### create_memory 工具参数

```typescript
interface CreateMemoryParams {
  content: string;     // 记忆内容
  importance: number;  // 重要性 1-10
}
```

### buildSystemPrompt 新签名

```typescript
function buildSystemPrompt(opts: {
  userAgent?: string;         // ← 新增
  wikiContext?: string[];     // ← 新增
  skills: Skill[];
  soul?: string;
  userProfile?: string;
  memory?: string[];
  mode?: "chat" | "briefing";
  agent?: AgentRole;          // briefing/onboarding 保留，chat 移除
  mcpTools?: Array<{ name: string; description: string }>;
  pendingIntentContext?: string;
  cognitiveContext?: string;
}): string;
```

## 依赖

- `prompt-architecture-v2-layers.md` — 本文件的上游分层定义（SharedAgent/UserAgent/五层存储/endChat）
- `cognitive-wiki.md` — Wiki 编译引擎（数据源）
- `chat-system.md` — Chat 对话流程
- `agent-tool-layer.md` — 工具注册和执行框架

## Implementation Phases (实施阶段)

- [x] Phase 1: DB migration — 创建 `user_agent` 表 + repository + 初始模板 ✅
- [x] Phase 2: SharedAgent + Soul 模板 — 拆分 AGENTS.md + chat.md → SHARED_AGENT.md（系统规则）+ Soul 初始模板（AI 人格）+ UserAgent 模板（用户规则） ✅
- [x] Phase 3: 自我维护工具 — 实现 update_soul / update_profile / update_user_agent / create_memory / send_notification 五个工具定义，从 registry 移除 update_user_info ✅
- [x] Phase 4: prompt-builder 重构 — 新组装顺序（SharedAgent → Soul → UserAgent → Profile → Memory → Wiki），注入 wikiContext ✅
- [x] Phase 5: context loader 重构 — loadWarmContext 加载 UserAgent，传递 wikiContext ✅
- [x] Phase 6: chat.ts 重构 — initChat 传递新参数 + 移除 `agent: "chat"`，endChat 精简（移除 soul/profile 更新代码） ✅
- [x] Phase 6b: Skill 重构 — loadSkills 默认 `enabled: false`，自动路由检查 UserAgent 技能配置，未开启的 skill 不激活 ✅
- [x] Phase 7: advisor-context 迁移 — loadChatCognitive / buildGoalDiscussionContext / buildInsightDiscussionContext / prefetchDeepSkillContext 全部从 strike/bond 改为 wiki_page ✅
- [ ] Phase 8: 清理 — 删除 agents/chat.md（内容已由 SHARED_AGENT.md + Soul 替代）

## 备注

- Soul 是 AI 的灵魂人格文档，不是用户指令集。初始模板定义了一个有情感、有个性的数字分身（场景 3.1b，见 layers 子域）
- Soul 可由 AI 主动微调（如发现用户偏好某种风格），不仅限于用户显式指令（场景 3.1c，见 layers 子域）
- UserAgent 存储用户视角的规则/流程/配置，不包含任何 AI 人格内容（场景 2.7，见 layers 子域）
- send_notification 工具每用户每天最多 3 条主动通知，用户可在 UserAgent 中关闭（场景 5.6）
- `update_user_info` 从 AI 工具列表移除，保留前端 REST API 路径（场景 5.5）
- briefing.md / onboarding.md 不受影响，它们仍从 agents/ 目录加载
- Memory 的两阶段管理（maybeCreateMemory）仍保留用于 AI Diary → Memory 提取管线
- 对话中的 create_memory 工具是简化版（跳过两阶段 AI 判断，因为调用方 AI 已完成判断）
- Memory 去重依赖现有 Mem0 两阶段机制（场景 4.3，见 layers 子域），无需新增标记
- UserAgent 某段落超过 20 条规则时自动合成精简（场景 2.4b，见 layers 子域）
- Phase 7 依赖 wiki 编译引擎已上线，wiki 表为空时所有认知函数返回空字符串（graceful degradation）
- `buildGoalDiscussionContext` 和 `buildInsightDiscussionContext` 也在 Phase 7 迁移（场景 6.4）
- 组装顺序：SharedAgent → Soul → UserAgent → Profile → Memory → Wiki（先确立"我是谁"再接受任务）
