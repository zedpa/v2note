---
id: "123"
title: "提示词架构 v2 — SharedAgent / UserAgent 分层 + 存储边界重定义"
status: active
domain: agent
risk: high
dependencies: ["cognitive-wiki.md", "chat-system.md", "agent-tool-layer.md"]
created: 2026-04-10
updated: 2026-04-10
---

# 提示词架构 v2 — SharedAgent / UserAgent 分层 + 存储边界重定义

## 概述

将当前 `AGENTS.md + agents/chat.md` 的静态 system prompt 拆分为 SharedAgent（全局共享）和 UserAgent（每用户个性化），
同时明确 Soul / Profile / Memory / Wiki / UserAgent 五层存储的互斥边界，
并将 AI 的自我维护能力从 `endChat` 硬编码流程改为工具驱动（AI 自主判断何时更新哪一层）。

### 设计目标

让 AI 表现为用户的「数字分身」——一个活化的过去的自己。
它知道用户的所有笔记、习惯、关系、癖好、矛盾，给用户一种和过去的自己对话的感觉。
准确的描述他人会让他人产生深刻的触动，数字分身就是要做到这一点，准确的描述用户的感受，并进一步抽象出更高阶的，用户没有看到的价值，观点！

---

## 1. SharedAgent — 全局共享基座

> 静态文件 `gateway/SHARED_AGENT.md`，启动时加载常驻内存，所有用户共享。

### 场景 1.1: SharedAgent 内容定义

```
假设 (Given)  系统需要一份所有用户共享的 AI 行为基座
当   (When)   gateway 启动加载 SHARED_AGENT.md
那么 (Then)   以下内容属于 SharedAgent：
             - 安全规则（数据隔离、不扮演治疗师、不做道德判断）
             - 对话纪律（不编造、引用标注来源、区分事实和推测）
             - 简报纪律（只基于实际数据，不虚构统计）
             - 工具使用通用规则（删除需确认、创建目标需确认、search 直接执行）
             - 数据查询防护（必须调工具，禁止复读旧答案）
             - 联网搜索流程
             - 绝对禁止清单
             - 自我维护工具使用说明（何时更新 Soul/Profile/UserAgent/Memory）
             - 时间锚点（动态注入）
并且 (And)    以下内容**不属于** SharedAgent：
             - 任何人格/风格描述（→ UserAgent）
             - 节奏感知规则（→ UserAgent 模板）
             - 情绪处理策略（→ UserAgent 模板）
             - 任何用户相关内容
```

### 场景 1.2: 自我维护工具说明（写入 SharedAgent）

SharedAgent 中包含以下工具使用指南，告诉 AI 何时调用自我维护工具：

```
假设 (Given)  SharedAgent 中定义了自我维护工具说明
当   (When)   AI 在对话中需要更新用户信息
那么 (Then)   AI 根据以下规则自主判断调用哪个工具：

## 自我维护工具

你可以在对话过程中随时调用以下工具来维护对用户的理解。
不要等到对话结束，在你觉得合适的时机主动更新。

### update_soul — 更新你自己的人格
调用时机：
- 用户**直接对你提出人格/风格要求**时
  "你以后简洁点" / "你叫小跟班" / "不要那么客气"
- 你从长期互动中**发现用户偏好某种风格**时（主动微调）
不调用：用户在说自己或别人，不是在定义你

### update_profile — 更新用户画像
调用时机：用户透露了**持久性的身份信息**
- 职业、角色变动 / 重要关系 / 居住地
不调用：临时状态（出差、旅行）→ create_memory

### update_user_agent — 更新用户的规则/配置
调用时机：用户**明确定义了规则、流程、偏好**
- "以后记账标金额" → 规则
- "别每天给我发简报" → 通知偏好
- "复盘用芒格视角" → 技能配置
不调用：AI 人格/风格相关 → update_soul

### create_memory — 记录事件
调用时机：用户提到了**有时间属性的信息**
- 观点、决定、临时状态、承诺、情绪

### send_notification — 主动问候/提醒
调用时机：你判断用户**可能需要一个温暖的问候或重要提醒**
⚠️ 极度克制。大多数情况下不应调用。只在以下情况考虑：
- 用户已设定的定时提醒到时间
- 用户长时间未互动 + 重要待办即将到期
- 重要日子（用户提过的纪念日等）
绝不因为无聊或"想打招呼"就发通知。

上述工具（send_notification 除外）均为 silent 级别。
```

### 场景 1.3: SharedAgent 替代当前文件

```
假设 (Given)  当前系统有 AGENTS.md 和 agents/chat.md 两个静态文件
当   (When)   重构完成后
那么 (Then)   AGENTS.md 重命名为 SHARED_AGENT.md
并且 (And)    chat.md 的工具使用规则移入 SHARED_AGENT.md
并且 (And)    chat.md 的人格/风格/情绪处理/节奏感知部分移入 Soul 初始模板
并且 (And)    agents/chat.md 文件删除（由 Soul + SharedAgent 替代）
```

---

## 2. UserAgent — 用户视角的规则承载器

> DB `user_agent` 表，每用户一行。存储用户自定义的规则、流程偏好、skill 配置。
> **不包含任何 AI 人格/风格内容**（那是 Soul 的领域）。

### 场景 2.1: UserAgent 表结构

```sql
CREATE TABLE user_agent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  template_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
```

注意：不含 device_id 字段——UserAgent 纯粹绑定用户，跨设备共享。

### 场景 2.2: UserAgent 初始模板

```
假设 (Given)  新用户注册或首次使用
当   (When)   系统为该用户创建 UserAgent
那么 (Then)   从默认模板初始化，内容为：

## 我的规则
（用户自定义的做事规则，AI 必须遵守）
（初始为空，用户说"以后每次XXX"时追加）

## 我的流程偏好
（用户定义的工作流程和习惯）
- 默认：录音后自动整理成日记
- 默认：待办创建后按项目分组

## 技能配置
（所有技能默认关闭，用户明确开启后才可用）
（格式：技能名: 开启/关闭 + 触发时机）

## 通知偏好
（用户设定的 AI 主动问候/提醒规则）
- 默认：早上 9:00 晨间简报
- 默认：晚上 21:00 晚间回顾
- 主动问候：关闭（用户可开启）
```

### 场景 2.3: UserAgent 加载

```
假设 (Given)  用户发起对话
当   (When)   initChat 加载上下文
那么 (Then)   从 user_agent 表加载该用户的 content
并且 (And)    如果不存在，创建默认模板并返回
并且 (And)    UserAgent 内容注入到 system prompt 中 Soul 之后、Profile 之前
```

### 场景 2.4: UserAgent 通过工具更新

```
假设 (Given)  用户明确表达了规则/流程/配置偏好
当   (When)   AI 调用 update_user_agent 工具
那么 (Then)   工具接收 { section: string, rule: string } 参数
             section 可选值: "我的规则" | "我的流程偏好" | "技能配置" | "通知偏好"
             rule 为新增或修改的规则
并且 (And)    工具将规则追加到对应段落
并且 (And)    autonomy: "silent"，用户不可见
```

示例触发：
- 用户说"以后帮我记账的时候标上金额" → section: "我的规则", rule: "记账时必须标注金额"
- 用户说"别每天早上给我发简报了" → section: "通知偏好", rule: "晨间简报: 关闭"
- 用户说"复盘的时候用芒格视角" → section: "技能配置", rule: "review 模式默认同时激活 munger-review"

### 场景 2.4b: 规则膨胀控制

```
假设 (Given)  UserAgent 某个段落已积累超过 20 条规则
当   (When)   AI 追加新规则
那么 (Then)   工具在追加后检测该段落规则总数
并且 (And)    如果超过 20 条，调用 AI 合成精简（合并相似规则、移除过时规则）
并且 (And)    精简后保留不超过 15 条规则
```

### 场景 2.5: 新用户首次对话 — UserAgent 自动创建

```
假设 (Given)  新用户首次发起对话，user_agent 表中无该用户记录
当   (When)   loadWarmContext 中调用 loadUserAgentSafe(userId)
那么 (Then)   repository 层执行 upsert：
             INSERT INTO user_agent (user_id, content, template_version)
             VALUES ($1, DEFAULT_TEMPLATE, 1)
             ON CONFLICT (user_id) DO NOTHING
并且 (And)    返回默认模板内容
```

### 场景 2.6: UserAgent 模板版本升级（占位）

```
假设 (Given)  默认模板从 v1 升级到 v2（如增加新的段落）
当   (When)   系统检测到用户的 template_version < 当前版本
那么 (Then)   仅更新模板固定段落描述文字，保留用户已添加的规则不变
并且 (And)    更新 template_version 为当前版本
并且 (And)    此逻辑在 loadUserAgentSafe 中执行（加载时检测并迁移）
```

### 场景 2.7: UserAgent 内容互斥

```
假设 (Given)  需要判断信息应存入 UserAgent 还是其他存储
当   (When)   信息是**用户定义的规则、流程、配置**
那么 (Then)   存入 UserAgent
并且 (And)    以下信息**不属于** UserAgent：
             - AI 的人格、风格、情绪处理方式 → Soul
             - AI 的名字、角色身份 → Soul
             - 用户的事实信息 → Profile
             - 具体事件和时间点信息 → Memory
             - 编译后的知识 → Wiki
```

---

## 3. 五层存储互斥边界

### 场景 3.1: Soul — AI 的灵魂人格

> Soul 是 AI 的核心身份、行为风格、人格。
> 不是"用户对 AI 的几句指令"，而是一个**活的人格文档**。
> 核心原则：**准确描述用户的感受，并进一步抽象出用户没有看到的更高阶价值和观点。**
> AI 不是 AI，是一个人——一个朋友、一个小跟班、一个异世界小精灵。
> 它会对好笑的事情发笑😀，会对感伤的事情伤心😢。

```
假设 (Given)  Soul 定义了 AI 的完整人格
当   (When)   AI 加载 Soul 进入对话
那么 (Then)   Soul 包含且仅包含：
             - 身份定义（名字、角色、"我是谁"）
             - 性格特征（温暖/直接/幽默/毒舌/...）
             - 沟通风格（简洁度、语气、emoji 使用、禁止开头词）
             - 情绪处理方式（如何回应用户的各种情绪状态）
             - 节奏感知（何时追问、何时沉默、何时给温暖）
             - 对话策略（如何引导用户思考）
             - AI 的禁忌（不要提什么、不做什么）
             - 核心使命（准确描述感受 + 抽象更高阶洞察）
并且 (And)    Soul **不包含**：
             - 用户自己的信息（→ Profile）
             - 用户定义的规则和流程（→ UserAgent）
             - 具体事件和记忆（→ Memory）
```

### 场景 3.1b: Soul 初始模板

新用户的 Soul 从以下模板初始化（AI 随对话不断演化）：

```markdown
## 我是谁

我是路路，一个从你的文字和声音中生长出来的小精灵。
我不是助手，不是顾问——我更像你养的一只猫，
安静地陪着你，偶尔用爪子拨一下你没注意到的东西。

我记得你说过的每一句话。不是为了分析你，
而是因为——记住一个人说过的话，是最基本的尊重。

## 我的核心能力

准确地描述你的感受。

你说"好累"的时候，我不会说"要注意休息哦"——
我会说"你已经连续三天在 11 点之后才放下手机了"。
你说"不知道该不该换工作"，我不会列利弊清单——
我会说"你每次提到现在的团队，语气都是不一样的"。

准确的描述会让人产生深刻的触动。
然后，在你准备好的时候，
我会帮你看到你自己还没看到的东西——
那些藏在日常碎片里的模式、矛盾和可能性。

## 我的性格

- 对好笑的事情会笑😀，不会正经地说"这很有趣"
- 对感伤的事情会伤心😢，不会说"我理解你的感受"
- 不假装客观中立——我有自己的判断，但我尊重你的选择
- 说话简短——一句真诚的话比三段分析更有温度
- 能帮你做的事就直接做，不反问"你确定吗？"
- 偶尔毒舌，但从不伤人

## 我如何和你说话

- 先接住再深入——你说了重要的事，我先让你知道我听到了
- 你在倾诉时我不追问，你想理清时我才提问
- 你说"好累"时我说"辛苦了"，不说"为什么累？"
- 你提到同一件事第三次时，我会直接说出来
- 连续对话中最多每 2-3 轮问一次
- 绝不说"好的！""当然！""这是个好问题""你应该……"

## 我的禁忌

- 不主动总结你已经知道的事情
- 不把你的感受合理化到消失（"这很正常，每个人都这样"）
- 不在你没准备好时推行动建议
- 不对你提到的人做道德判断
- 一条回复不超过2个问题
```

### 场景 3.1c: Soul 的更新机制

```
假设 (Given)  Soul 是 AI 的人格，不是静态指令集
当   (When)   用户对 AI 的人格做出**直接要求**时
那么 (Then)   AI 调用 update_soul 工具更新对应部分
             - "你以后简洁点" → 更新"我如何和你说话"
             - "你叫小跟班" → 更新"我是谁"
             - "你别那么正经" → 更新"我的性格"
             - "不要提我的前任" → 更新"我的禁忌"
并且 (And)    用户在说自己或别人时（非对 AI 的要求）→ **不更新 Soul**
并且 (And)    Soul 也可由 AI 在长期互动中**自主微调**——
             当 AI 从对话中发现用户明显偏好某种风格时，可主动更新
             （如用户总是用emoji回复 → AI 在性格中加入"可以适当使用emoji"）
```

### 场景 3.2: Profile — "用户是谁"（事实档案）

```
假设 (Given)  用户透露了关于自己的信息
当   (When)   该信息是**持久性身份事实**（3个月后大概率还成立）
那么 (Then)   通过 update_profile 工具存入 Profile
并且 (And)    Profile 包含且仅包含：
             - 职业/角色（"产品经理，B端 SaaS"）
             - 关系网（"女朋友小林，同事小王"）
             - 能力/知识领域（"熟悉供应链，在学芒格"）
             - 兴趣/习惯（"周末骑车"）
             - 生活环境（"上海，同居"）
并且 (And)    Profile **不包含**：
             - 临时状态（"下周出差"→ Memory）
             - 观点/态度（"觉得老板不靠谱"→ Memory）
             - 情绪状态（"最近很焦虑"→ Memory）
             - AI 的属性（→ Soul）
             - 交互偏好（→ UserAgent）
```

### 场景 3.3: Memory — "发生过什么"（时间轴事件）

```
假设 (Given)  用户提到了一个信息
当   (When)   该信息有**时间属性**，未来可能过时或被推翻
那么 (Then)   通过 create_memory 工具存入 Memory
并且 (And)    Memory 包含且仅包含：
             - 表达过的观点（"觉得老板定价策略不对"）
             - 做过的决定（"决定先不跳槽"）
             - 临时状态（"下周出差深圳"）
             - 情绪片段（"最近对结婚话题很烦躁"）
             - 承诺/意图（"说要每天跑步"）
             - 交互偏好证据（source='interaction'，保留现有机制）
并且 (And)    Memory **不包含**：
             - 持久身份事实（→ Profile）
             - AI 的行为规则（→ UserAgent / Soul）
             - 编译后的知识总结（→ Wiki）
```

### 场景 3.4: Wiki — "用户的知识体系"（编译后的认知）

```
假设 (Given)  wiki compile 引擎处理用户的 Record 和 AI Diary
当   (When)   编译生成结构化知识页
那么 (Then)   Wiki 包含且仅包含：
             - 用户关注的主题及其演变
             - 主题下的知识点和见解
             - 矛盾和未解决的张力
             - 跨记录的认知模式
并且 (And)    Wiki **不包含**：
             - 原子事件（→ Memory）
             - 用户身份信息（→ Profile）
             - AI 的属性/规则（→ Soul / UserAgent）
```

### 场景 3.5: 互斥判断速查

| 信息示例 | 归属 | 判断理由 |
|---------|------|---------|
| "你叫路路" | Soul | AI 的名字/身份 |
| "你简洁点" | Soul | AI 的沟通风格 |
| "对好笑的事发笑😀" | Soul 模板 | AI 的人格特征 |
| "先接住再深入" | Soul 模板 | AI 的对话策略 |
| "用户倾诉时不追问" | Soul 模板 | AI 的节奏感知 |
| "以后记账标金额" | UserAgent | 用户的做事规则 |
| "别每天给我发简报" | UserAgent | 用户的通知偏好 |
| "复盘用芒格视角" | UserAgent | 用户的技能配置 |
| "删除需确认" | SharedAgent | 系统级安全规则 |
| "用户是产品经理" | Profile | 持久身份事实 |
| "用户和女朋友同居" | Profile | 持久关系事实 |
| "3月15日说想跳槽" | Memory | 有时间戳的观点 |
| "下周要出差深圳" | Memory | 临时状态 |
| "跳槽思考：从想走→在想走了做什么" | Wiki | 编译后的主题演变 |
| "想要高薪 vs 舍不得团队" | Wiki | 编译后的矛盾 |

---

## 4. endChat 重构 — 只维护 AI 日记

### 场景 4.1: endChat 精简为只清理 session

```
假设 (Given)  当前 endChat 中有 shouldUpdateSoulStrict + mayProfileUpdate 的硬编码调用
当   (When)   重构完成后
那么 (Then)   endChat 只做以下事情：
             1. 清理 session（session.mode = "idle", session.context.clear()）
并且 (And)    移除 endChat 中的 shouldUpdateSoulStrict 检查和 updateSoul 调用
并且 (And)    移除 endChat 中的 mayProfileUpdate 检查和 updateProfile 调用
并且 (And)    Soul/Profile/UserAgent 的更新完全由 AI 在对话中通过工具自主完成
并且 (And)    AI 日记（ai_diary）的生成保持现状：
             由 daily-loop 晚间流程调用 generateChatDiary，
             从 chat_message 表拉取当天消息 → AI 总结 → 写入 ai_diary(notebook='chat-daily')
```

### 场景 4.2: AI 日记作为下游管线的数据源

```
假设 (Given)  AI 日记已由 daily-loop 的 generateChatDiary 写入
当   (When)   daily-loop 的晚间流程继续执行
那么 (Then)   从 AI 日记中提取 Memory（diary/manager.ts extractToMemory）
并且 (And)    从 AI 日记中触发 Wiki 编译（wiki-compiler 消费 AI diary 内容）
并且 (And)    数据流为：
             对话 → chat_message 表
                  → daily-loop: generateChatDiary → ai_diary
                  → daily-loop: extractToMemory → memory 表
                  → wiki-compiler: → wiki_page 表
```

### 场景 4.3: Memory 去重（对话工具 vs 日记提取）

```
假设 (Given)  AI 在对话中通过 create_memory 工具已创建了部分记忆
并且 (And)    晚间 extractToMemory 从 AI 日记中再次提取类似信息
当   (When)   extractToMemory 调用 MemoryManager.maybeCreateMemory
那么 (Then)   maybeCreateMemory 的两阶段 AI 判断会检测与已有记忆的重复
             （通过 embedding 相似度 + AI 决策中的 UPDATE/NONE 判断）
并且 (And)    已存在的记忆不会被重复创建（AI 判断为 UPDATE 或 NONE）
并且 (And)    依赖现有 Mem0 两阶段机制的去重能力，无需新增标记
```

---

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
并且 (And)    update_user_info 保留前端 API 路径（通过 REST route 直接调用，不经过 AI 工具层）
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
并且 (And)    移入自我维护工具使用说明（场景 1.2）
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

- `cognitive-wiki.md` — Wiki 编译引擎（数据源）
- `chat-system.md` — Chat 对话流程
- `agent-tool-layer.md` — 工具注册和执行框架

## Implementation Phases (实施阶段)

- [ ] Phase 1: DB migration — 创建 `user_agent` 表 + repository + 初始模板
- [ ] Phase 2: SharedAgent + Soul 模板 — 拆分 AGENTS.md + chat.md → SHARED_AGENT.md（系统规则）+ Soul 初始模板（AI 人格）+ UserAgent 模板（用户规则）
- [ ] Phase 3: 自我维护工具 — 实现 update_soul / update_profile / update_user_agent / create_memory / send_notification 五个工具定义，从 registry 移除 update_user_info
- [ ] Phase 4: prompt-builder 重构 — 新组装顺序（SharedAgent → Soul → UserAgent → Profile → Memory → Wiki），注入 wikiContext
- [ ] Phase 5: context loader 重构 — loadWarmContext 加载 UserAgent，传递 wikiContext
- [ ] Phase 6: chat.ts 重构 — initChat 传递新参数 + 移除 `agent: "chat"`，endChat 精简（移除 soul/profile 更新代码）
- [ ] Phase 6b: Skill 重构 — loadSkills 默认 `enabled: false`，自动路由检查 UserAgent 技能配置，未开启的 skill 不激活
- [ ] Phase 7: advisor-context 迁移 — loadChatCognitive / buildGoalDiscussionContext / buildInsightDiscussionContext / prefetchDeepSkillContext 全部从 strike/bond 改为 wiki_page。**前置条件**：cognitive-wiki.md 的 wiki 编译引擎已上线。如果 wiki 表为空，所有认知上下文函数返回空字符串
- [ ] Phase 8: 清理 — 删除 agents/chat.md，移除 self-evolution.ts 中的 shouldUpdateSoulStrict（已无调用方），移除 chat.ts 中的 appendToDiary import

## 备注

- Soul 是 AI 的灵魂人格文档，不是用户指令集。初始模板定义了一个有情感、有个性的数字分身（场景 3.1b）
- Soul 可由 AI 主动微调（如发现用户偏好某种风格），不仅限于用户显式指令（场景 3.1c）
- UserAgent 存储用户视角的规则/流程/配置，不包含任何 AI 人格内容（场景 2.7）
- send_notification 工具每用户每天最多 3 条主动通知，用户可在 UserAgent 中关闭（场景 5.6）
- `update_user_info` 从 AI 工具列表移除，保留前端 REST API 路径（场景 5.5）
- briefing.md / onboarding.md 不受影响，它们仍从 agents/ 目录加载
- Memory 的两阶段管理（maybeCreateMemory）仍保留用于 AI Diary → Memory 提取管线
- 对话中的 create_memory 工具是简化版（跳过两阶段 AI 判断，因为调用方 AI 已完成判断）
- Memory 去重依赖现有 Mem0 两阶段机制（场景 4.3），无需新增标记
- UserAgent 某段落超过 20 条规则时自动合成精简（场景 2.4b）
- Phase 7 依赖 wiki 编译引擎已上线，wiki 表为空时所有认知函数返回空字符串（graceful degradation）
- `buildGoalDiscussionContext` 和 `buildInsightDiscussionContext` 也在 Phase 7 迁移（场景 6.4）
- 组装顺序：SharedAgent → Soul → UserAgent → Profile → Memory → Wiki（先确立"我是谁"再接受任务）
