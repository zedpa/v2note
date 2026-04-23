---
id: "103"
title: "语音控制完整化 v2"
status: completed
domain: voice
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 语音控制完整化 v2

> 状态：✅ 核心+确认流完成 | 优先级：P0（4/1公测前）| Phase 8.5
> delete确认: system prompt 工具使用规则强制AI先描述再等确认 (2026-03-29)
> 完美闭环需等 chat 状态机改造（暂停 stream 等用户输入），当前方案可用
> 依赖：voice-action（已完成）, agent-tool-layer（已完成）

## 背景与决策记录

### 现状评估
- `voice-action.ts` 已实现指令路由层，集成在 `process.ts` Step 0，能自动识别"记录/指令/混合"
- `voice-commands.ts` 独立存在，处理 ≤15 字的导航类短指令
- `ToolRegistry` 共 13 个工具，voice-action 和 ToolRegistry 是**两套平行系统**
- Session 按 deviceId 维护，含 mode/context/memoryManager，但 voice-action **完全不使用 Session**

### 本 spec 解决的问题

| 问题 | 类型 | 影响 |
|------|------|------|
| `delete_todo` 工具缺失 | 新增工具 | chat 模式无法删待办 |
| `search` 只做文本匹配，无结构化过滤 | 增强工具 | "我今天有几个待办"无法回答 |
| `delete_todo` 确认流程没有闭环 | Bug | 说"取消那个"永远不会真正删除 |
| `create_todo` 使用假 record_id | Bug | 数据完整性问题 |
| `update_todo` description 写错 | 小修 | AI 误导：提示用 delete_record 删待办 |
| 上滑手势 = 强制命令通道 | 新增能力 | 用户明确表达指令意图时跳过 AI 分类 |

### 不做的事（公测前）
- 不新增 `query_todos` / `query_goals` 独立工具（增强 search 参数即可）
- 不新增 `navigate_to` 工具（移动端用户直接点 Tab，语音导航是伪需求）
- 不新增 `set_reminder` / `trigger_review` / `update_settings`（公测不需要）
- 不合并 voice-action 和 ToolRegistry 为单一系统（公测后再收敛）
- 不做 ActionHistory / undo 机制（公测后再做）

---

## Part A：工具层修复

### 场景 A1：chat 模式删除待办

```
假设 (Given)  用户在 AI 聊天窗口，有一条待办"联系供应商"
当   (When)   用户说"帮我删掉联系供应商那个待办"
那么 (Then)   AI 识别到 delete_todo 工具
并且 (And)    先通过 search 工具查找到目标待办 ID
并且 (And)    delete_todo 为 confirm 级别，前端展示确认卡片
并且 (And)    "确认删除「联系供应商」吗？" + [确认] [取消]
当   (When)   用户点击 [确认]
那么 (Then)   DB 软删除该待办（done=true 或物理删除，见接口约定）
并且 (And)    AI 回复"已删除「联系供应商」"
当   (When)   用户点击 [取消]
那么 (Then)   不执行，AI 回复"好的，已取消"
```

### 场景 A2：search 按状态过滤

```
假设 (Given)  用户在 chat 模式，今天有 3 个未完成待办
当   (When)   用户说"我今天有哪些待办"
那么 (Then)   AI 调用 search({ scope: "todos", filters: { status: "active", date: "today" } })
并且 (And)    返回今天 scheduled_start 在今日、且 done=false 的待办列表
并且 (And)    AI 汇总回复"今天还有 3 件事：xxx、xxx、xxx"
```

### 场景 A3：search 按目标过滤

```
假设 (Given)  用户有目标"Q2供应链重建"（goal_id=xxx），关联了 5 条待办
当   (When)   用户说"供应链那个目标下还有哪些没做"
那么 (Then)   AI 调用 search({ scope: "todos", filters: { goal_id: "xxx", status: "active" } })
并且 (And)    返回 parent_id=xxx 且 done=false 的待办列表
并且 (And)    AI 汇总进度
```

### 场景 A4：search 按时间范围查记录

```
假设 (Given)  用户有多条日记
当   (When)   用户说"上周关于张总的记录"
那么 (Then)   AI 调用 search({ query: "张总", scope: "records", filters: { date_from: "2026-03-23", date_to: "2026-03-29" } })
并且 (And)    返回该时间段内 content/summary 包含"张总"的记录
```

### 场景 A5：search 按 domain 过滤

```
假设 (Given)  用户有工作和生活两类待办
当   (When)   用户说"工作上还有什么要做的"
那么 (Then)   AI 调用 search({ scope: "todos", filters: { domain: "工作", status: "active" } })
并且 (And)    返回 domain="工作" 且 done=false 的待办
```

---

## Part B：voice-action Bug 修复

### 场景 B1：delete_todo 确认流程闭环（Bug 修复）

```
假设 (Given)  用户通过语音说"取消周五的评审会"
当   (When)   voice-action 识别为 delete_todo，返回 needs_confirm=true
那么 (Then)   process.ts 将确认请求通过 WS 发送 action.confirm 消息给前端
并且 (And)    前端 AI 气泡显示确认卡片："确认取消「周五评审会」吗？" + [确认] [算了]
当   (When)   用户点击 [确认] 或语音说"确认"/"对"
那么 (Then)   前端发送 action.confirm_reply { confirm_id, confirmed: true }
并且 (And)    gateway 收到后执行实际删除（todoRepo.update(id, { done: true })）
并且 (And)    WS 推送 action.result { success: true, summary: "已取消「周五评审会」" }
当   (When)   用户点击 [算了] 或 5 秒无响应
那么 (Then)   不执行，气泡消失
```

### 场景 B2：voice-action create_todo 使用真实 record_id（Bug 修复）

```
假设 (Given)  用户语音说"提醒我明天打电话给李总"，process 正在处理 recordId="abc-123"
当   (When)   voice-action 识别为 create_todo
那么 (Then)   create_todo 使用当前正在处理的 recordId="abc-123" 而非 "voice-action" 字符串
并且 (And)    待办正常关联到对应日记记录
并且 (And)    mixed 类型时：同一 recordId 的日记和待办都能正确写入
```

---

## Part C：上滑 = 强制命令通道

### 场景 C1：用户上滑录音，跳过 AI 分类直接进入 Agent

```
假设 (Given)  用户在日记输入区
当   (When)   用户按住录音键向上滑动（forceCommand 手势），说"把张总那个改到明天下午三点"
那么 (Then)   前端上传录音时附带 forceCommand: true 标志
并且 (And)    process.ts 收到 forceCommand=true，跳过 classifyVoiceIntent() 的规则预筛和 AI 分类
并且 (And)    直接将整段文本作为 action 类型处理，走 Agent 工具链（ToolRegistry）
并且 (And)    ToolRegistry 执行 update_todo，返回 action.result 气泡
并且 (And)    不创建日记记录（forceCommand 模式纯指令）
```

### 场景 C2：强制命令通道下 AI 无法理解指令

```
假设 (Given)  用户上滑后说了一句含糊的话"那个...算了"
当   (When)   forceCommand=true，AI 工具调用无法匹配到合适工具
那么 (Then)   返回"没有理解你的指令，这条已作为日记记录"
并且 (And)    降级走正常 Digest 管道（fallback 到 record 处理）
```

### 场景 C3：普通录音仍走自动判断

```
假设 (Given)  用户正常按下录音键（不上滑），说"今天开会很无聊"
当   (When)   forceCommand 未设置（false）
那么 (Then)   走现有 classifyVoiceIntent() 自动判断流程，识别为 record 型
并且 (And)    正常走 Digest，用户不感知任何变化
```

---

## 接口约定

### A：新增 delete_todo 工具

```typescript
// gateway/src/tools/definitions/delete-todo.ts
{
  name: "delete_todo",
  description: `删除（取消）待办事项。
使用：用户明确说要删除/取消某个待办。
注意：此操作为 confirm 级别，执行前会展示确认卡片。`,
  parameters: z.object({
    todo_id: z.string().min(1).describe("待办事项 ID"),
    reason: z.string().optional().describe("可选：删除原因（用于 AI 回复措辞）"),
  }),
  autonomy: "confirm",
  handler: async (args, ctx) => {
    await todoRepo.update(args.todo_id, { done: true });
    // 软删除：标记 done=true，保留数据
    return {
      success: true,
      message: `已删除待办 (ID: ${args.todo_id})`,
      data: { todo_id: args.todo_id },
    };
  }
}
```

### B：search 工具增强参数

```typescript
// 在现有 search 工具 parameters 中新增 filters 字段
filters: z.object({
  status: z.enum(["active", "completed", "all"]).optional()
    .describe("待办状态：active=未完成, completed=已完成, all=全部"),
  date: z.string().optional()
    .describe("日期快捷键：today/tomorrow/yesterday，或 ISO 日期 2026-03-29"),
  date_from: z.string().optional().describe("时间范围起始（ISO 日期）"),
  date_to: z.string().optional().describe("时间范围结束（ISO 日期）"),
  goal_id: z.string().optional().describe("过滤：属于指定目标的待办"),
  domain: z.string().optional().describe("过滤：按领域（工作/生活/学习等）"),
}).optional().describe("可选：结构化过滤条件"),
```

`unifiedSearch` 实现同步更新：
- `searchTodos`：解除硬编码 `findPendingByDevice`，按 filters.status 决定查 done=false/true/全部
- `searchTodos`：按 filters.date / date_from / date_to 过滤 `scheduled_start`
- `searchTodos`：按 filters.goal_id 过滤 `parent_id`
- `searchTodos`：按 filters.domain 过滤 `domain` 字段
- `searchRecords`：按 filters.date_from / date_to 过滤 `created_at`
- `searchGoals`：按 filters.status 决定查 active/completed/全部（解除硬编码 findActiveByDevice）
- 现有 `time_range` 参数：**兼容保留，内部映射到 filters.date_from/date_to**（不删除）

### C：process.ts forceCommand 扩展

```typescript
// ProcessPayload 新增字段
export interface ProcessPayload {
  // ...现有字段
  forceCommand?: boolean;  // 上滑手势触发，跳过自动分类，强制走 Agent
}

// process.ts Step 0 逻辑变更
if (payload.forceCommand) {
  // 强制命令通道：直接走 ToolRegistry（chat-style 单次工具调用）
  const result = await executeAsAgentCommand(payload.text, {
    deviceId: payload.deviceId,
    userId: payload.userId,
    sessionId: getSession(payload.deviceId).id,
  });
  // 推送 action.result WS 消息
  // 如果 AI 无法理解 → fallback 到 record 处理
} else {
  // 现有自动分类流程不变
  const intentResult = await classifyVoiceIntent(payload.text);
  // ...
}
```

### D：delete_todo 确认流程 WS 消息（补全 spec 中已定义但未实现的协议）

```typescript
// Server → Client（已在 voice-action spec 中定义，本次实现）
{ type: "action.confirm"; payload: {
    confirm_id: string;       // UUID，用于匹配回复
    action: ActionIntent;
    summary: string;          // "确认取消「周五评审会」吗？"
    todo_id: string;
    risk_level: "high";
}}

// Client → Server
{ type: "action.confirm_reply"; payload: {
    confirm_id: string;
    confirmed: boolean;
}}
```

---

## 边界条件

- [ ] `delete_todo` 传入不存在的 todo_id：返回 `{ success: false, message: "待办不存在" }`
- [ ] `delete_todo` 已完成的待办：仍可删除（done=true 等于归档，再次设置幂等）
- [ ] search filters 全部为空：降级为纯文本匹配（现有行为）
- [ ] search filters.date="today" 但无 scheduled_start 的待办：不参与日期过滤（只过滤有排期的）
- [ ] search filters 和 time_range 同时传入：filters 优先，time_range 作为 fallback
- [ ] forceCommand=true 但文本为空：直接返回 error，不走任何流程
- [ ] forceCommand=true，AI 工具调用失败（无匹配工具）：降级为 record 处理，推送提示气泡
- [ ] delete_todo 确认 5 秒超时无回复：pending confirm 自动过期，不执行
- [ ] voice-action create_todo 的 recordId 由 process.ts 注入，不应在 voice-action 内硬编码

---

## 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `gateway/src/tools/definitions/delete-todo.ts` | **新建** | delete_todo 工具定义 + handler |
| `gateway/src/tools/definitions/index.ts` | 修改 | 注册 delete_todo |
| `gateway/src/tools/definitions/update-todo.ts` | 小修 | description 中"删除用 delete_record"改为"delete_todo" |
| `gateway/src/tools/definitions/search.ts` | 修改 | 新增 filters 参数定义 |
| `gateway/src/tools/search.ts` | 修改 | 实现 filters 过滤逻辑（4个 scope 各自增强） |
| `gateway/src/handlers/process.ts` | 修改 | ProcessPayload 加 forceCommand，Step 0 加分支 |
| `gateway/src/handlers/voice-action.ts` | 修改 | executeCreateTodo 接收 recordId 参数；delete confirm 写入 Session |
| `gateway/src/session/manager.ts` | 修改 | Session 加 pendingConfirms: Map<string, PendingConfirm> |
| `gateway/src/index.ts` 或 WS handler | 修改 | 处理 action.confirm_reply 消息，执行实际删除 |
| `features/recording/components/input-bar.tsx` | 修改 | 上滑手势识别 → forceCommand: true |
| `shared/lib/gateway-client.ts` | 修改 | 发送 action.confirm_reply；接收 action.confirm 并通知 UI |
| `features/ai-bubble/` | 修改 | 渲染 action.confirm 确认卡片 |

---

## AI 调用影响

| 场景 | AI 调用变化 |
|------|------------|
| search filters 增强 | +0（纯 DB 查询，不调用 AI） |
| delete_todo 工具 | +0（DB 操作） |
| forceCommand 通道 | 复用现有 chat streamWithTools，不额外增加调用次数 |
| delete confirm 闭环 | +0（只是 WS 消息 + DB 执行） |
| voice-action create_todo fix | +0（bug fix，不改流程） |

---

## 验收标准

1. **chat 模式**：用户说"删掉联系供应商"，AI 展示确认卡片，点确认后待办消失
2. **chat 模式**：用户说"我今天有哪些待办"，AI 正确列出今天有 scheduled_start 且未完成的待办
3. **chat 模式**：用户说"工作上还没做的"，AI 正确按 domain 过滤返回结果
4. **语音模式**：用户普通录音说"取消周五评审会"，AI 气泡弹出确认，点确认后实际删除
5. **语音模式**：用户上滑录音说"把张总那个改到明天下午三点"，直接走工具链执行，不创建日记
6. **语音模式**：用户普通录音说"今天开会很无聊"，正常走 Digest，不触发指令流程
7. **数据完整性**：语音指令创建的待办 record_id 为真实 UUID，不是字符串 "voice-action"
