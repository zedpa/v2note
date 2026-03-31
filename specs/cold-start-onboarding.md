# 冷启动 5 问（v2：AI 驱动对话）

> 状态：🔵 开发中 | 优先级：Phase 2
> v1 → v2 重构：从硬编码填表式改为 AI 驱动的真对话

## 概述
冷启动 5 问是用户的第一印象。v1 的问题：AI 对用户回答零反馈、领域选择弹窗太传统、问题机械不自然、简短回答生成的日记质量差。v2 改为 AI 驱动的真对话——每步有回应、问题自然过渡、不创建日记只存 Profile，突出 Agent+ 时代智能笔记的感觉。

## 设计原则

1. **先回应，再过渡**：AI 必须先对用户回答做 1 句回应，再自然引出下一个话题
2. **不创建日记**：5 问的目的是了解用户，不是替用户写日记。回答只存 Profile/Soul
3. **删掉领域选择弹窗**：从 Q2 回答自然解析维度，不打断对话流
4. **打字机效果**：AI 回复逐字显示 + typing indicator，增强"在思考"的感觉
5. **Q1 固定，Q2-Q5 AI 生成**：Q1 问名字是固定的，后续问题由 AI 根据上下文自然生成

## 对话示例

```
AI:   你好！我是路路 🦌 怎么称呼你？
User: 小潘
AI:   小潘你好！你平时主要在忙什么呢？
User: 在铸造厂上班，业余做自己的产品
AI:   铸造厂 + 做产品，挺充实的！最近最花心思的是哪边的事？
User: 产品快上线了
AI:   上线前最忙了。你会不会经常想到什么转头就忘？
User: 是的总是忘
AI:   这正是路路要帮你解决的 😊 你一般什么时候有空，我帮你整理当天的想法？
User: 睡前
AI:   好的小潘，每晚我会帮你梳理当天的想法。我们开始吧 ✨
```

## 场景

### 场景 1: AI 驱动的 5 问对话
```
假设 (Given)  新用户首次打开 App（UserProfile.onboarding_done ≠ true）
当   (When)   点击"开始"进入对话
那么 (Then)   路路发出 Q1（固定）："你好！我是路路 🦌 怎么称呼你？"

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

### 场景 2: AI 回应的约束
```
假设 (Given)  用户提交了某步回答
当   (When)   后端调 AI 生成回应
那么 (Then)   AI 回应必须包含两部分：
              ① 对用户回答的 1 句回应/共鸣（不超过 15 字）
              ② 自然过渡到下一个话题的提问
并且 (And)    总长度 ≤ 50 字（简洁有温度，不啰嗦）
并且 (And)    AI 在 system prompt 中拿到完整对话历史，确保上下文连贯
并且 (And)    AI 不得使用"好的！""收到！"等机械回应
```

### 场景 3: 5 问话题引导（AI prompt 约束）
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

### 场景 4: 数据存储（不创建日记）
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

### 场景 5: Q5 完成后的系统初始化
```
假设 (Given)  用户完成 Q5（或 AI 判定 done=true）
当   (When)   后端处理最后一步
那么 (Then)   标记 UserProfile.onboarding_done = true
并且 (And)    调用 seedWelcomeDiaries(userId, deviceId) 插入 3 篇欢迎日记
并且 (And)    调用 seedDimensionGoals(userId, deviceId, Q2 回答) 创建维度目标
并且 (And)    拼接 Q1-Q5 全部回答写入 UserProfile.content
并且 (And)    触发 updateProfile + updateSoul（fire-and-forget，用对话内容初始化 AI 人格）
```

### 场景 6: 跳过机制
```
假设 (Given)  用户不想回答某个问题
当   (When)   点击"跳过这个问题"
那么 (Then)   前端发送 { step, answer: "" }
并且 (And)    后端跳过该字段存储
并且 (And)    AI 生成不含回应部分的下一问（只有提问）
并且 (And)    Q1 和 Q2 不允许跳过（必填）
并且 (And)    全局"跳过，直接开始"按钮始终可用（标记 done，触发初始化，使用默认值）
```

### 场景 7: 已完成用户不再触发
```
假设 (Given)  UserProfile.onboarding_done = true
并且 (And)    localStorage 有 v2note:onboarded:${userId} = "true"
当   (When)   用户打开 App
那么 (Then)   不显示冷启动对话，直接进入主界面
```

### 场景 8: 打字机效果
```
假设 (Given)  后端返回 AI 回应
当   (When)   前端显示回应
那么 (Then)   先显示 typing indicator（"···" 气泡，0.5 秒）
并且 (And)    然后逐字显示回应文字（每字 30-50ms）
并且 (And)    显示完成后才激活输入框
并且 (And)    用户在等待时输入框 disabled + placeholder 显示"路路在想..."
```

## 接口约定

### POST /api/v1/onboarding/chat（新端点，替代 /answer）

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

### AI System Prompt（约束 fast tier）
```
你是路路（🦌），一个温暖、简洁的 AI 助手。你正在和新用户做第一次对话。

规则：
1. 每次回应 = 1 句回应（≤15字）+ 1 句提问，总共 ≤ 50 字
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

## 边界条件
- [ ] 极短回答（"上班" 2 字）：AI 仍需自然回应，不报错
- [ ] 超长回答（>500 字）：截断到前 500 字传给 AI
- [ ] AI 调用失败：fallback 到 v1 硬编码问题（不阻塞流程）
- [ ] AI 回应超时（>5 秒）：显示 fallback 问题 + toast 提示
- [ ] 用户中途退出再回来：从 Q1 重新开始（不持久化中间状态，5 问很快）
- [ ] 并发请求：后端用 step 号幂等，同一 step 多次提交取最后一次

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `features/cognitive/components/onboarding-seed.tsx` | 重构：删硬编码问题 + 加打字机效果 + 删 DomainSelector 引用 |
| `features/cognitive/components/domain-selector.tsx` | 删除（不再使用） |
| `gateway/src/routes/onboarding.ts` | 新增 POST /api/v1/onboarding/chat 端点 |
| `gateway/src/handlers/onboarding.ts` | 重构：handleOnboardingChat 替代 handleOnboardingAnswer，集成 AI 调用 |
| `gateway/src/handlers/onboarding-prompt.ts` | 新增：AI system prompt 定义 |
| `gateway/src/db/repositories/user-profile.ts` | 新增字段方法：occupation, current_focus, review_time |
| `supabase/migrations/xxx_onboarding_v2.sql` | 新增 UserProfile 字段 |

## 数据库变更

UserProfile 表新增字段：
```sql
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS current_focus TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS review_time TEXT;
```

## AI 调用

| 步骤 | tier | 次数 | 用途 |
|------|------|------|------|
| Q1 回应 | fast | 1 | 生成对名字的回应 + Q2 问题 |
| Q2 回应 | fast | 1 | 回应 + Q3 问题 + 提取维度 |
| Q3 回应 | fast | 1 | 回应 + Q4 问题 + 提取焦点 |
| Q4 回应 | fast | 1 | 回应 + Q5 问题 + 提取痛点 |
| Q5 回应 | fast | 1 | 生成结束语 + 提取时间 |
| Profile/Soul 初始化 | background | 2 | fire-and-forget |
| **总计** | | **5+2** | 比 v1 多 5 次 fast 调用，换来对话体验 |

## 验收标准

1. 新用户 2 分钟内完成 5 问，全程感觉在和 AI 聊天而非填表
2. AI 每步回应有温度、不机械、自然过渡
3. 完成后主界面有 3 篇欢迎日记 + 侧边栏有维度
4. 不产生低质量的 onboarding 日记
5. AI 失败时 fallback 不阻塞流程
