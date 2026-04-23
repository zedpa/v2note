---
id: fix-agent-tool-behavior
title: "Fix: AI 工具调用异常（不调用/暴露名称/重复执行）"
status: completed
backport: agent-tool-layer.md
domain: agent
risk: medium
dependencies: []
created: 2026-04-08
updated: 2026-04-08
---

# Fix: AI 工具调用异常

## Bug 现象

三个相关问题：
1. **不调用工具**：AI 在对话中说"我要用 create_todo 工具帮你创建待办"，但实际没有调用，只是文字描述
2. **暴露工具名**：AI 在回复中提到工具名称（如 "create_todo"）和内部工作流，用户不应看到这些
3. **重复创建日记**：语音 AI 调用 create_diary 工具时会创建两遍相同的日记

## 根因分析

### 问题 1: AI 不调用工具

**位置**：`gateway/src/ai/provider.ts:404-413`

`streamWithTools()` 调用 `streamText()` 时**没有设置 `toolChoice` 参数**，AI SDK 默认 `toolChoice: "auto"`，AI 可以自由选择用文字回复代替工具调用。当 AI "不确定"是否该调用时，它会退回到文字描述模式。

```typescript
// 当前代码（provider.ts L404-413）
const result = streamText({
  model: provider.chat(config.model),
  messages: currentMessages,
  tools,
  temperature: 0.7,
  maxSteps: 1,
  // ← 缺少 toolChoice 参数
});
```

### 问题 2: AI 暴露工具名称

**位置**：`gateway/agents/chat.md:25-30`

工具使用规则中**缺少"禁止说出工具名"的指令**。AI 知道自己有哪些工具（通过 function calling schema），在回复中会提到工具名称和执行流程。

当前 chat.md 只说了"可以直接调用"，没说"不要告诉用户你在调用什么"。

### 问题 3: 重复创建日记

**根因确认（来自生产日志）**：WebSocket 重连导致上下文重放。

日志时序：
1. 客户端连接 → 恢复 20 条历史消息 → AI 执行 `create_record`，成功创建日记
2. **客户端断开**（网络波动/锁屏/切后台）
3. **客户端重连** → 再次恢复 20 条消息（包含"帮我创建日记"那条用户消息）
4. AI 看到未处理的用户请求 → **再次调用 `create_record`** → 重复创建

**不是**多步循环问题，是上下文恢复后重放了已执行的用户请求。核心：恢复的历史消息中没有标记"该请求已被工具执行过"。

## 1. 工具调用保障

### 场景 1.1: AI 有明确操作意图时必须调用工具
```
假设 (Given)  用户表达了明确的操作意图（如"帮我记一条日记""创建一个待办"）
当   (When)   AI 处理该消息
那么 (Then)   AI 必须调用对应工具执行操作
并且 (And)    不得用文字描述代替工具调用
```

### 场景 1.2: AI 纯聊天时不强制调用工具
```
假设 (Given)  用户在闲聊或表达情绪（无操作意图）
当   (When)   AI 处理该消息
那么 (Then)   AI 用文字回复即可，不需要调用工具
```

## 2. 禁止暴露工具名称

### 场景 2.1: AI 回复中不出现工具名
```
假设 (Given)  AI 正在执行工具调用
当   (When)   AI 生成回复文本
那么 (Then)   回复中不得出现工具名称（如 create_todo、create_diary、web_search 等）
并且 (And)    不得描述内部工作流（如"我先搜索再用 fetch_url 获取"）
并且 (And)    只说结果（如"已帮你创建待办：明天3点开会"）
```

### 场景 2.2: 工具执行状态对用户友好
```
假设 (Given)  工具正在执行中
当   (When)   前端显示工具状态
那么 (Then)   显示友好的中文提示（如"正在创建待办…"）
并且 (And)    不显示内部工具名（如 create_todo）
```

## 3. 防止 WebSocket 重连导致重复执行

### 场景 3.1: 重连后恢复的历史消息包含工具执行结果
```
假设 (Given)  用户之前的消息已触发工具调用并成功执行
当   (When)   WebSocket 断开后重连，恢复历史消息
那么 (Then)   恢复的消息中包含工具调用结果（tool result）
并且 (And)    AI 看到该请求已被处理，不再重复执行
```

### 场景 3.2: 工具调用结果持久化到 chat_message
```
假设 (Given)  AI 调用工具（如 create_record）并成功执行
当   (When)   工具返回结果
那么 (Then)   工具调用信息（tool_call + tool_result）保存到 chat_message 表
并且 (And)    恢复上下文时一并加载，AI 可识别已执行过的操作
```

### 场景 3.3: 兜底 — create_record 幂等性
```
假设 (Given)  短时间内（60 秒）对同一用户调用两次 create_record
当   (When)   第二次调用的 content 与第一次相同
那么 (Then)   返回已有记录 ID，不创建新记录
```

## 4. 扩展读写工具集

### 场景 4.1: read_diary — AI 按需读取某天日记
```
假设 (Given)  用户在聊天中提到某个日期
当   (When)   AI 需要回忆该日期的详情
那么 (Then)   调用 read_diary({ date, end_date? }) 加载 ai_diary 全量内容
并且 (And)    单天返回 full_content，范围返回各天摘要
```

### 场景 4.2: read_user_info — AI 读取用户配置信息
```
假设 (Given)  AI 需要了解用户的身份、画像或配置
当   (When)   AI 调用 read_user_info({ type })
那么 (Then)   type="soul" → 返回 AI 身份设定（soul 表）
并且 (And)    type="profile" → 返回用户画像（user_profile 表）
并且 (And)    type="config" → 返回用户本地配置（localConfig 概要）
```

### 场景 4.3: update_user_info — AI 修改用户配置信息
```
假设 (Given)  用户要求 AI 修改自身设定或画像
当   (When)   AI 调用 update_user_info({ type, content })
那么 (Then)   type="soul" → 更新 soul 表内容
并且 (And)    type="profile" → 更新 user_profile 表
并且 (And)    修改操作需用户确认后才执行（同 delete 类工具策略）
```

## 验收行为（E2E 锚点）

### 行为 1: 用户要求创建待办，AI 直接执行
1. 用户在聊天中说"帮我记一个待办：明天下午开会"
2. AI 应调用工具创建待办（不是用文字说"我会用 create_todo"）
3. AI 回复"已创建待办：明天下午开会"（不提工具名）

### 行为 2: AI 不暴露内部实现
1. 用户要求搜索某信息
2. AI 执行搜索工具
3. AI 回复搜索结果，不说"我使用了 web_search 工具搜索了 xxx"

### 行为 3: 日记不重复创建
1. 用户说"帮我记一条日记：今天心情不错"
2. AI 调用 create_diary，创建一条日记
3. 不应出现两条相同内容的日记

## 边界条件
- [ ] AI 调用工具失败时，应告知用户操作失败，不暴露错误细节
- [ ] 多个工具需要连续调用时（如搜索→获取），用户只看到最终结果
- [ ] 用户主动问"你用了什么工具"时，可以简要回答但不暴露内部名称

## 修复方案

### 改动 1: `agents/chat.md` — 添加工具行为约束
在工具使用规则中增加：
```markdown
- **绝对禁止**在回复中提及工具名称（如 create_todo、web_search、fetch_url）和执行流程
- **正确做法**：直接调用工具，回复只说结果（"已帮你创建待办""搜索到以下信息"）
- 不要说"我来调用 xxx 工具"——直接做，像人一样说结果
```

### 改动 2: `provider.ts` — 考虑 toolChoice 策略
- 当前默认 `auto` 已合理（不应所有场景都强制调用工具）
- 但需在 chat.md prompt 中更强地引导："当用户明确要求操作时，必须调用工具，不要用文字描述替代"
- 如果 prompt 引导仍不够，可考虑在检测到操作意图时设置 `toolChoice: "required"`（需评估副作用）

### 改动 3: 工具调用结果持久化 + 上下文恢复
- **chat.ts L312-319**：恢复历史消息时，同时加载 tool_call + tool_result 类型的消息
- **chat.ts sendChatMessage**：AI 工具调用成功后，将 tool_call（名称+参数）和 tool_result（返回值）作为消息存入 chat_message 表
- 这样重连恢复后，AI 能看到"这个请求已经处理过了"

### 改动 4: `create_record` 幂等性兜底
- 在 `handleCreateRecord()` 中查询最近 60 秒内同用户是否有相同 content 的 record
- 有则返回已有 ID，不重复创建

### 改动 5: 新增读写工具集
新增以下工具并注册到 `tools/definitions/index.ts`：

| 工具名 | 类型 | 功能 | 确认策略 |
|--------|------|------|---------|
| `read_diary` | 读 | 按日期加载 ai_diary（单天全量/范围摘要） | 无需确认 |
| `read_user_info` | 读 | 读取 soul / profile / localConfig | 无需确认 |
| `update_user_info` | 写 | 修改 soul / profile | 需用户确认 |

## 依赖
- gateway/agents/chat.md
- gateway/src/ai/provider.ts
- gateway/src/handlers/chat.ts（上下文恢复 + 工具结果持久化）
- gateway/src/tools/definitions/（新工具文件）
- gateway/src/tools/definitions/index.ts（注册）
- gateway/src/tools/definitions/create-record.ts（幂等性）
- gateway/src/db/repositories/ai-diary.ts
- gateway/src/db/repositories/chat-message.ts

## Implementation Phases
- [ ] Phase 1: 修改 chat.md — 禁止暴露工具名 + 强化工具调用引导
- [ ] Phase 2: chat.ts — 工具调用结果持久化到 chat_message + 恢复时加载
- [ ] Phase 3: create-record.ts — 幂等性兜底
- [ ] Phase 4: 新增 read_diary / read_user_info / update_user_info 工具
- [ ] Phase 5: 单元测试

## 备注
- 重复创建的根因是 WebSocket 重连重放，不是多步循环问题
- toolChoice: "required" 有副作用，不推荐全局设置，prompt 引导优先
- `\x00TOOL_STATUS` 是前端控制字符，不是暴露给用户的文本，无需修改
- read_diary 同时解决 fix-ai-memory-time 中的"AI 无法回忆某天详情"问题，该 spec 中不再重复实现
