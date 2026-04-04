---
id: "052"
title: "Cold Start & Onboarding"
status: active
domain: onboarding
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-04
---

# Cold Start & Onboarding

> 合并自：cold-start-welcome.md、cold-start-onboarding.md、cold-start-bonds.md

## 概述

冷启动流程覆盖用户从首次打开 App 到"感受到产品价值"的完整路径：AI 引导对话收集用户画像 → 欢迎种子内容让时间线不空 → 早期关联检测让用户第 6 条日记就看到"这个工具在理解我"。

---

## 1. Welcome Seeds (欢迎种子内容)

<!-- ✅ completed -->

> 原始文件：cold-start-welcome.md | 状态：✅ 已完成 | 完成日期：2026-03-31

用户完成冷启动5问后，时间线应立刻展示一组**预存欢迎日记**（material 类型），带有完整的标签、Strike 结构和跨日记关联——让用户第一眼就感知到"这个产品能从混沌中长出结构"。同时修复标签链路断裂，日记内容支持 Markdown 渲染，侧边栏"发现"按钮变灰并展示未来功能全景。

### 1.1 预存欢迎日记

#### 场景 1.1.1: 冷启动完成后插入欢迎日记
```
假设 (Given)  用户刚完成冷启动5问（onboarding_done=true）
当   (When)   onboarding 流程结束、进入主界面
那么 (Then)   时间线中出现 3 条欢迎日记（source_type='material'）
并且 (And)    日记样式与用户日记完全一致，无特殊标识
并且 (And)    日记按预设顺序排列，时间戳间隔 1 分钟
并且 (And)    每条日记带有预设标签（record_tag），立刻可见
并且 (And)    欢迎日记之间有跨日记关联（Bond），展开可见"相关记录"
```

#### 场景 1.1.2: 欢迎日记内容 — 3 篇
```
日记 1: "念念有路 · 功能介绍"
  内容（Markdown格式）：
    产品核心能力介绍——语音/文字混沌输入、AI 自动拆解为想法和待办、
    标签自动生成、相关日记链接、每日回顾、目标管理。
    用分段和加粗突出关键功能。
  标签：[功能介绍, 产品指南]
  Strike: 2-3 个 perceive 类

日记 2: "路路诞生的故事"
  内容（Markdown格式）：
    路路（AI 助手）的诞生背景——为什么需要一个"认知操作系统"，
    从混沌想法到结构涌现的设计理念，AI 沉默为主的哲学。
  标签：[路路的故事, 产品理念]
  Strike: 2-3 个 realize 类

日记 3: "创始人的信"
  内容（Markdown格式）：
    创始人写给用户的一封信——为什么做这个产品、
    对"记录→认知→行动"的理解、当前版本的状态、邀请用户一起探索。
  标签：[创始人, 写给你的信]
  Strike: 2 个 realize 类

Bond 关系：
  日记1 ↔ 日记2: type=context_of, strength=0.7
  日记2 ↔ 日记3: type=resonance, strength=0.6
```

#### 场景 1.1.3: 欢迎日记可删除
```
假设 (Given)  时间线中有欢迎日记
当   (When)   用户删除某条欢迎日记
那么 (Then)   正常删除（CASCADE 清理 strike/bond/tag）
并且 (And)    删除后不会重新创建
```

#### 场景 1.1.4: 不重复插入
```
假设 (Given)  用户已完成冷启动且欢迎日记已存在
当   (When)   用户再次打开应用或重新登录
那么 (Then)   不会重复创建欢迎日记
```

### 1.2 标签链路修复

#### 场景 1.2.1: Digest L1 标签立刻可见
```
假设 (Given)  用户输入一条日记并触发 Digest L1
当   (When)   Digest 完成 Strike 分解并写入 strike_tag
那么 (Then)   同时将标签通过 tagRepo.upsert + addToRecord 写入 record_tag
并且 (And)    用户刷新时间线后立刻看到标签
并且 (And)    后续 Tier2 产出的聚类标签可追加（ON CONFLICT DO NOTHING）
```

### 1.3 日记 Markdown 渲染

#### 场景 1.3.1: 日记内容支持分段和加粗
```
假设 (Given)  日记内容包含 Markdown 格式（段落、**加粗**、列表等）
当   (When)   用户在时间线查看日记卡片或展开详情
那么 (Then)   内容以 Markdown 格式渲染（使用现有 MarkdownContent 组件）
并且 (And)    卡片摘要（short_summary）支持 Markdown
并且 (And)    展开后的 transcript 支持 Markdown
```

### 1.4 侧边栏"发现"变灰 + 未来功能提示

#### 场景 1.4.1: 发现按钮变灰
```
假设 (Given)  用户打开侧边栏
当   (When)   侧边栏渲染完成
那么 (Then)   "发现"按钮显示为灰色（opacity-40）
并且 (And)    图标和文字均为灰色调
```

#### 场景 1.4.2: 点击弹出未来功能列表
```
假设 (Given)  侧边栏中"发现"按钮为灰色
当   (When)   用户点击"发现"按钮
那么 (Then)   弹出轻量 toast 或气泡提示：
              "更多功能还在路上
               认知地图 · 大师视角 · 行动复盘
               Skills · MCP · Tools"
并且 (And)    提示 3 秒后自动消失
并且 (And)    不触发页面跳转
```

### 1.5 边界条件
- [ ] 多设备登录不重复创建（通过 user_id 查询 source_type='material' 的 system 记录判重）
- [ ] 欢迎日记 Strike 不参与 Tier2 聚类（source_type='material' 已有降权机制）
- [ ] record_tag 复合主键防止标签重复（ON CONFLICT DO NOTHING）

### 1.6 实现要点

1. **欢迎日记数据**：独立文件 `gateway/src/handlers/welcome-seed.ts`，硬编码 3 篇内容 + Strike + Bond + Tag
2. **调用时机**：onboarding.ts Q5 完成后调用 `seedWelcomeDiaries(userId, deviceId)`
3. **标签修复**：digest.ts 写 strike_tag 后追加 tagRepo.upsert + addToRecord
4. **Markdown 渲染**：notes-timeline.tsx 中 `<p>` 替换为 `<MarkdownContent>`
5. **侧边栏灰色入口**：sidebar-drawer.tsx 修改发现按钮样式 + 点击事件

---

## 2. AI Onboarding Conversation (AI 引导对话)

> 原始文件：cold-start-onboarding.md | 状态：开发中 | 优先级：Phase 2

冷启动 5 问是用户的第一印象。v1 的问题：AI 对用户回答零反馈、领域选择弹窗太传统、问题机械不自然、简短回答生成的日记质量差。v2 改为 AI 驱动的真对话——每步有回应、问题自然过渡、不创建日记只存 Profile，突出 Agent+ 时代智能笔记的感觉。

### 2.1 设计原则

1. **先回应，再过渡**：AI 必须先对用户回答做 1 句回应，再自然引出下一个话题
2. **不创建日记**：5 问的目的是了解用户，不是替用户写日记。回答只存 Profile/Soul
3. **删掉领域选择弹窗**：从 Q2 回答自然解析维度，不打断对话流
4. **打字机效果**：AI 回复逐字显示 + typing indicator，增强"在思考"的感觉
5. **Q1 固定，Q2-Q5 AI 生成**：Q1 问名字是固定的，后续问题由 AI 根据上下文自然生成

### 2.2 对话示例

```
AI:   你好！我是路路 怎么称呼你？
User: 小潘
AI:   小潘你好！你平时主要在忙什么呢？
User: 在铸造厂上班，业余做自己的产品
AI:   铸造厂 + 做产品，挺充实的！最近最花心思的是哪边的事？
User: 产品快上线了
AI:   上线前最忙了。你会不会经常想到什么转头就忘？
User: 是的总是忘
AI:   这正是路路要帮你解决的 你一般什么时候有空，我帮你整理当天的想法？
User: 睡前
AI:   好的小潘，每晚我会帮你梳理当天的想法。我们开始吧
```

### 2.3 场景

#### 场景 2.3.1: AI 驱动的 5 问对话
```
假设 (Given)  新用户首次打开 App（UserProfile.onboarding_done ≠ true）
当   (When)   点击"开始"进入对话
那么 (Then)   路路发出 Q1（固定）："你好！我是路路 怎么称呼你？"

当   (When)   用户回答 Q1
那么 (Then)   前端发送 { step:1, answer } 到后端
并且 (And)    后端存 UserProfile.name
并且 (And)    后端调 AI（fast tier）生成回应 + 下一问，返回 { reply, done:false }
并且 (And)    前端用打字机效果逐字显示 AI 回应
并且 (And)    Q2-Q5 重复此流程

当   (When)   后端返回 { done: true }
那么 (Then)   前端显示结束语（AI 生成）
并且 (And)    1.5 秒后自动进入主界面
并且 (And)    触发 seedWelcomeDiaries + seedDimensionGoals
```

#### 场景 2.3.2: AI 回应的约束
```
假设 (Given)  用户提交了某步回答
当   (When)   后端调 AI 生成回应
那么 (Then)   AI 回应必须包含两部分：
              1. 对用户回答的 1 句回应/共鸣（不超过 15 字）
              2. 自然过渡到下一个话题的提问
并且 (And)    总长度 <= 50 字（简洁有温度，不啰嗦）
并且 (And)    AI 在 system prompt 中拿到完整对话历史，确保上下文连贯
并且 (And)    AI 不得使用"好的！""收到！"等机械回应
```

#### 场景 2.3.3: 5 问话题引导（AI prompt 约束）
```
假设 (Given)  AI 需要在 5 轮内覆盖以下话题
那么 (Then)   AI 的 system prompt 规定话题顺序：
              Q1: 称呼（固定问法，不走 AI）
              Q2: 在做什么 / 生活阶段 → 提取维度
              Q3: 最近关注的事 → 提取焦点
              Q4: 痛点 / 想法管理困扰 → 提取 pain_points
              Q5: 空闲时间 / 习惯 → 提取 review_time
并且 (And)    AI 可以根据用户回答灵活调整问法，但必须覆盖这 5 个话题
并且 (And)    如果用户在某步回答中自然涵盖了后续话题（如 Q2 提到了痛点），AI 可跳过对应步骤
```

#### 场景 2.3.4: 数据存储（不创建日记）
```
假设 (Given)  用户完成某步回答
当   (When)   后端处理回答
那么 (Then)   只写入 UserProfile 字段，不创建 record / transcript / diary
              Q1 → UserProfile.name
              Q2 → UserProfile.occupation（新字段）
              Q3 → UserProfile.current_focus（新字段）
              Q4 → UserProfile.pain_points
              Q5 → UserProfile.review_time（新字段）
并且 (And)    Q2 回答同时触发 seedDimensionGoals（关键词提取维度，创建 L1 目标）
并且 (And)    所有回答拼接后写入 UserProfile.content（供后续 AI 对话作为 context）
```

#### 场景 2.3.5: Q5 完成后的系统初始化
```
假设 (Given)  用户完成 Q5（或 AI 判定 done=true）
当   (When)   后端处理最后一步
那么 (Then)   标记 UserProfile.onboarding_done = true
并且 (And)    调用 seedWelcomeDiaries(userId, deviceId) 插入 3 篇欢迎日记
并且 (And)    调用 seedDimensionGoals(userId, deviceId, Q2 回答) 创建维度目标
并且 (And)    拼接 Q1-Q5 全部回答写入 UserProfile.content
并且 (And)    触发 updateProfile + updateSoul（fire-and-forget，用对话内容初始化 AI 人格）
```

#### 场景 2.3.6: 跳过机制
```
假设 (Given)  用户不想回答某个问题
当   (When)   点击"跳过这个问题"
那么 (Then)   前端发送 { step, answer: "" }
并且 (And)    后端跳过该字段存储
并且 (And)    AI 生成不含回应部分的下一问（只有提问）
并且 (And)    Q1 和 Q2 不允许跳过（必填）
并且 (And)    全局"跳过，直接开始"按钮始终可用（标记 done，触发初始化，使用默认值）
```

#### 场景 2.3.7: 已完成用户不再触发
```
假设 (Given)  UserProfile.onboarding_done = true
并且 (And)    localStorage 有 v2note:onboarded:${userId} = "true"
当   (When)   用户打开 App
那么 (Then)   不显示冷启动对话，直接进入主界面
```

#### 场景 2.3.8: 打字机效果
```
假设 (Given)  后端返回 AI 回应
当   (When)   前端显示回应
那么 (Then)   先显示 typing indicator（"..." 气泡，0.5 秒）
并且 (And)    然后逐字显示回应文字（每字 30-50ms）
并且 (And)    显示完成后才激活输入框
并且 (And)    用户在等待时输入框 disabled + placeholder 显示"路路在想..."
```

### 2.4 接口约定

#### POST /api/v1/onboarding/chat（新端点，替代 /answer）

请求：
```typescript
interface OnboardingChatRequest {
  step: number;           // 1-5，当前回答的是第几步
  answer: string;         // 用户回答（空字符串 = 跳过）
  history: Array<{        // 完整对话历史（前端维护）
    role: "ai" | "user";
    text: string;
  }>;
}
```

响应：
```typescript
interface OnboardingChatResponse {
  reply: string;          // AI 生成的回应 + 下一问（或结束语）
  nextStep: number;       // 下一步编号（done=true 时无意义）
  done: boolean;          // 是否完成全部对话
  extracted: {            // 后端从回答中提取的字段（debug 用，前端可忽略）
    name?: string;
    occupation?: string;
    current_focus?: string;
    pain_points?: string;
    review_time?: string;
    dimensions?: string[];
  };
}
```

### 2.5 AI System Prompt（约束 fast tier）
```
你是路路（鹿），一个温暖、简洁的 AI 助手。你正在和新用户做第一次对话。

规则：
1. 每次回应 = 1 句回应（<=15字）+ 1 句提问，总共 <= 50 字
2. 回应要有温度，体现你理解了用户说的内容，禁止"好的！""收到！"等机械词
3. 提问要自然过渡，不能像问卷
4. 你需要在 5 轮内了解：称呼、在做什么、最近关注什么、想法管理的困扰、空闲时间
5. 当前是第 {step} 轮，话题是 {topic}
6. 如果用户的回答已经涵盖了后续话题，可以跳过，直接问下一个未覆盖的
7. 最后一轮结束时，用"好的{name}，..."开头写一句温暖的结束语，包含你将如何帮助 ta

你必须输出 JSON：
{
  "reply": "你的回应文字",
  "extracted_fields": { ... },  // 从回答中提取的字段
  "skip_to": null | number      // 如果要跳过某步，指定跳到第几步
}
```

### 2.6 边界条件
- [ ] 极短回答（"上班" 2 字）：AI 仍需自然回应，不报错
- [ ] 超长回答（>500 字）：截断到前 500 字传给 AI
- [ ] AI 调用失败：fallback 到 v1 硬编码问题（不阻塞流程）
- [ ] AI 回应超时（>5 秒）：显示 fallback 问题 + toast 提示
- [ ] 用户中途退出再回来：从 Q1 重新开始（不持久化中间状态，5 问很快）
- [ ] 并发请求：后端用 step 号幂等，同一 step 多次提交取最后一次

### 2.7 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `features/cognitive/components/onboarding-seed.tsx` | 重构：删硬编码问题 + 加打字机效果 + 删 DomainSelector 引用 |
| `features/cognitive/components/domain-selector.tsx` | 删除（不再使用） |
| `gateway/src/routes/onboarding.ts` | 新增 POST /api/v1/onboarding/chat 端点 |
| `gateway/src/handlers/onboarding.ts` | 重构：handleOnboardingChat 替代 handleOnboardingAnswer，集成 AI 调用 |
| `gateway/src/handlers/onboarding-prompt.ts` | 新增：AI system prompt 定义 |
| `gateway/src/db/repositories/user-profile.ts` | 新增字段方法：occupation, current_focus, review_time |
| `supabase/migrations/xxx_onboarding_v2.sql` | 新增 UserProfile 字段 |

### 2.8 数据库变更

UserProfile 表新增字段：
```sql
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS current_focus TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS review_time TEXT;
```

### 2.9 AI 调用

| 步骤 | tier | 次数 | 用途 |
|------|------|------|------|
| Q1 回应 | fast | 1 | 生成对名字的回应 + Q2 问题 |
| Q2 回应 | fast | 1 | 回应 + Q3 问题 + 提取维度 |
| Q3 回应 | fast | 1 | 回应 + Q4 问题 + 提取焦点 |
| Q4 回应 | fast | 1 | 回应 + Q5 问题 + 提取痛点 |
| Q5 回应 | fast | 1 | 生成结束语 + 提取时间 |
| Profile/Soul 初始化 | background | 2 | fire-and-forget |
| **总计** | | **5+2** | 比 v1 多 5 次 fast 调用，换来对话体验 |

### 2.10 验收标准

1. 新用户 2 分钟内完成 5 问，全程感觉在和 AI 聊天而非填表
2. AI 每步回应有温度、不机械、自然过渡
3. 完成后主界面有 3 篇欢迎日记 + 侧边栏有维度
4. 不产生低质量的 onboarding 日记
5. AI 失败时 fallback 不阻塞流程

---

## 3. Early Bond Detection (早期关联检测)

<!-- ✅ completed -->

> 原始文件：cold-start-bonds.md | 状态：✅ 已完成 | 完成日期：2026-03-24

前 10 条日记时 Cluster 还没涌现，但 Bond 从第 2 条日记就能产生。需要把 Strike 级 Bond 聚合为日记级"相关记录"推荐，让用户尽早感受到"这个工具在理解我"。这是用户留存的关键：第 6 条日记就能看到关联。

### 3.1 场景

#### 场景 3.1.1: Digest L1 即时产生跨记录 Bond
```
假设 (Given)  用户已有 5 条种子日记（冷启动产出）
并且 (And)    第 6 条日记被 Digest L1 处理
当   (When)   新 Strike 和历史 Strike 做混合检索
那么 (Then)   至少发现 1 条 bond (strength > 0.5)
并且 (And)    bond 写入数据库
```

**当前状态：** digest.ts 已实现跨记录 bond 检测。本场景为确认 + 冷启动上下文验证。

#### 场景 3.1.2: 日记级关联度聚合
```
假设 (Given)  日记 A 的 3 个 Strike 和日记 B 的 2 个 Strike 间有 4 条 bond
当   (When)   请求 GET /api/v1/records/:id/related
那么 (Then)   返回日记 B 作为相关记录
并且 (And)    关联度 = Sum(bond.strength) / max(strikeCount_A, strikeCount_B)
并且 (And)    只返回关联度 > 0.4 的日记
并且 (And)    material 来源的 bond 在聚合时 strength x 0.2
并且 (And)    结果按关联度降序，最多返回 10 条
```

#### 场景 3.1.3: 时间线卡片显示关联计数
```
假设 (Given)  日记 A 有 3 条相关记录
当   (When)   渲染时间线卡片
那么 (Then)   底部显示关联数标记
并且 (And)    点击后焦点侧边栏展示相关记录列表
并且 (And)    每条相关记录显示：摘要 + 日期 + 关联度指示条
```

#### 场景 3.1.4: 冷启动后第一条手动日记立刻看到关联
```
假设 (Given)  用户完成冷启动 5 问（产出 5 条种子日记 + 10-20 个 Strike）
并且 (And)    用户手动写了第 6 条日记（关于工作的某个话题）
当   (When)   Digest L1 完成
那么 (Then)   该日记底部大概率显示关联 1-2 条
并且 (And)    因为冷启动 Q2/Q3 的回答大概率和工作话题语义相关
```

#### 场景 3.1.5: 无关联时不显示
```
假设 (Given)  日记完全是新话题，和历史无交集
当   (When)   关联查询返回空
那么 (Then)   不显示关联标记（不显示空状态）
并且 (And)    不影响卡片渲染
```

### 3.2 边界条件
- [ ] 大量日记（>500）时聚合查询性能：应 < 200ms
- [ ] 自己和自己不关联
- [ ] 同一 record 的 Strike 间 bond 不计入跨日记关联

### 3.3 涉及文件

| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/record-relations.ts` | 日记级 bond 聚合逻辑 |
| 新建 `gateway/src/routes/record-relations.ts` | GET /api/v1/records/:id/related |
| `features/diary/components/diary-card.tsx` 或同等 | 修改：添加关联计数标记 |
| `features/diary/components/focus-sidebar.tsx` 或同等 | 修改：展示相关记录列表 |

### 3.4 数据库变更
无（基于已有 strike + bond 表聚合）

### 3.5 AI 调用
0 次（纯 bond 聚合计算）

### 3.6 验收标准
用户第 6 条日记（冷启动 5 问之后的第 1 条手动记录）就能看到关联。点击能展开相关日记列表。

---

## Implementation Phases (实施阶段)

| 阶段 | 模块 | 状态 | 说明 |
|------|------|------|------|
| Phase 1 | Early Bond Detection | ✅ 已完成 | 第 6 条日记即可看到关联 |
| Phase 1 | Welcome Seeds | ✅ 已完成 | 3 篇欢迎日记 + 标签修复 + Markdown + 侧边栏 |
| Phase 2 | AI Onboarding Conversation | 开发中 | v1 → v2 重构，AI 驱动真对话 |

### 依赖关系
```
AI Onboarding Conversation (Phase 2)
  └── Welcome Seeds (Phase 1) ✅
       └── Early Bond Detection (Phase 1) ✅
```

Welcome Seeds 依赖 Onboarding 完成后触发 `seedWelcomeDiaries`；Early Bond Detection 依赖种子日记的存在来产生首批关联。
