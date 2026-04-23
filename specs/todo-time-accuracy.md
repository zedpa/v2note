---
status: superseded
superseded_by: "todo-system.md"
id: "todo-time-accuracy"
domain: todo
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# 待办时间解析准确性修复

> 状态：🟡 待开发

## 概述
修复待办时间解析不准确的问题：用户说"明天干XX"设到今天，"周末干XX"设到周六。根因是 LLM 提示词中时间计算指令不明确、三条创建路径各自处理时间、Chat 路径完全缺少日期上下文。

## 现状问题

| # | 问题 | 根因 | 位置 |
|---|------|------|------|
| 1 | **"明天"设成今天** | digest-prompt 示例错误：nucleus 写"明天"，scheduled_start 用 `${today}` | `digest-prompt.ts:71` |
| 2 | **"周末"设成周六** | prompt 中无明确"周末"定义，LLM 自行推断 | `digest-prompt.ts:56` |
| 3 | **Voice Action 无日期上下文** | CLASSIFY_PROMPT 不含当前日期，LLM 无法算绝对日期 | `voice-action.ts:83` |
| 4 | **Voice Action 创建待办丢时间** | executeCreateTodo 未把 scheduled_start 写入数据库 | `voice-action.ts:382-411` |
| 5 | **Chat Tool 无日期上下文** | chat system prompt 无当前日期，LLM 调用 create_todo 时不知今天几号 | `prompt-builder.ts` |
| 6 | **三条路径逻辑不统一** | voice-action 直接调 todoRepo，跳过 tool handler 的 embedding/record 创建 | `voice-action.ts:393` |

## 改动 A：共享时间锚点（消除 LLM 自行计算）

### 场景 A1: 预计算时间锚点嵌入提示词
```
假设 (Given)  当前日期为 2026-04-02（周三）
当   (When)   任一 LLM prompt 需要时间上下文
那么 (Then)   调用 buildDateAnchor() 生成预计算查找表嵌入 prompt
并且 (And)    查找表包含：今天、明天、后天、大后天、本周六、本周日、下周一、月底
并且 (And)    LLM 直接查表获取绝对日期，禁止自行计算
```

### 接口约定

新建 `gateway/src/lib/date-anchor.ts`：

```typescript
/**
 * 生成预计算时间锚点查找表，嵌入 LLM prompt。
 * LLM 直接查表，禁止自行做日期算术。
 */
export function buildDateAnchor(): string
```

输出示例（2026-04-02 周三调用）：
```
## 时间锚点（直接查表，禁止自行计算）

当前：2026-04-02（周三）

| 用户说 | 日期 |
|--------|------|
| 今天 | 2026-04-02 |
| 明天 | 2026-04-03 |
| 后天 | 2026-04-04 |
| 大后天 | 2026-04-05 |
| 这周六/周六 | 2026-04-04 |
| 周末/这周日/周日 | 2026-04-05 |
| 下周一 | 2026-04-06 |
| 下周五 | 2026-04-10 |
| 月底 | 2026-04-30 |

输出格式：ISO 8601
- 有具体时间："2026-04-03T15:00:00"
- "上午" → T09:00:00
- "下午" → T14:00:00
- "晚上" → T20:00:00
- 仅日期无具体时间 → T09:00:00（默认上午）
- "这周之内""月底前" → 写入 deadline，不是 scheduled_start
- 无任何时间信号 → 不填 scheduled_start
```

### 场景 A2: "周末"映射规则
```
假设 (Given)  用户说"周末去做XX"
当   (When)   LLM 查找时间锚点
那么 (Then)   "周末" = 本周日（周日）
并且 (And)    "这周六" = 本周六（区分于"周末"）
```

### 场景 A3: 已过日期自动顺延
```
假设 (Given)  今天是周日
当   (When)   用户说"周末做XX"
那么 (Then)   "周末" 指下周日（不指今天）
```

```
假设 (Given)  今天是周六
当   (When)   用户说"这周六做XX"
那么 (Then)   "这周六" 指今天
```

### 场景 A4: 默认时间兜底
```
假设 (Given)  用户说"明天找张总"（无具体时间点）
当   (When)   LLM 提取 scheduled_start
那么 (Then)   scheduled_start = "2026-04-03T09:00:00"（默认上午9点）
并且 (And)    而不是留空或只写日期
```

---

## 改动 B：三条路径统一引用时间锚点

### 场景 B1: Digest 路径注入锚点
```
假设 (Given)  digest-prompt.ts 的 buildDigestPrompt() 生成提取 prompt
当   (When)   用户说"明天下午3点找张总确认报价"
那么 (Then)   prompt 包含 buildDateAnchor() 输出的查找表
并且 (And)    示例中 scheduled_start 使用正确的明天日期（不再用 ${today}）
并且 (And)    LLM 从表中查到"明天 = 2026-04-03"，输出 "2026-04-03T15:00:00"
```

修改：`gateway/src/handlers/digest-prompt.ts`
- 删除手动日期计算（today/weekday/tomorrow 变量）
- import `buildDateAnchor`，替换时间解析 section
- 修正示例中 scheduled_start 为 tomorrow 日期

### 场景 B2: Voice Action 路径注入锚点
```
假设 (Given)  voice-action.ts 的 buildClassifyPrompt() 生成分类 prompt
当   (When)   用户说"提醒我后天下午开会"
那么 (Then)   prompt 包含 buildDateAnchor() 输出的查找表
并且 (And)    LLM 从表中查到"后天 = 2026-04-04"
并且 (And)    返回 changes.scheduled_start = "2026-04-04T14:00:00"
```

修改：`gateway/src/handlers/voice-action.ts`
- `buildClassifyPrompt()` 中删除手动日期计算
- import `buildDateAnchor`，嵌入 prompt

### 场景 B3: Chat Tool 路径注入锚点
```
假设 (Given)  用户在对话中说"帮我建个待办，下周一交报告"
当   (When)   chat AI 调用 create_todo tool
那么 (Then)   system prompt 包含 buildDateAnchor() 输出的查找表
并且 (And)    AI 传入 scheduled_start = "2026-04-06T09:00:00"（下周一）
```

修改：`gateway/src/skills/prompt-builder.ts`
- `buildTieredContext()` 的 hot tier 末尾注入 `buildDateAnchor()`

---

## 改动 C：Voice Action 待办创建统一走 create_todo tool handler

### 场景 C1: voice-action 复用 tool handler
```
假设 (Given)  voice-action 分类为 create_todo
当   (When)   executeCreateTodo() 执行
那么 (Then)   调用 createTodoTool.handler() 而非直接调 todoRepo
并且 (And)    scheduled_start、priority 正确写入数据库
并且 (And)    自动创建关联 record（如无 recordId）
并且 (And)    自动写入 embedding（与 Chat tool 一致）
```

修改：`gateway/src/handlers/voice-action.ts`

```typescript
import { createTodoTool } from "../tools/definitions/create-todo.js";

async function executeCreateTodo(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult> {
  const text = action.changes?.text ?? cleanActionPrefix(action.original_text);
  if (!text) {
    return { action: "create_todo", success: false, summary: "没有提取到待办内容" };
  }

  // 统一走 create_todo tool handler
  const toolResult = await createTodoTool.handler(
    {
      text,
      link_record_id: ctx.recordId,
      scheduled_start: action.changes?.scheduled_start,
      priority: action.changes?.priority,
    },
    {
      deviceId: ctx.deviceId,
      userId: ctx.userId,
      sessionId: "voice-action",
    },
  );

  return {
    action: "create_todo",
    success: toolResult.success,
    summary: toolResult.message,
    todo_id: toolResult.data?.todo_id as string | undefined,
  };
}
```

### 场景 C2: Digest 投影路径保持独立
```
假设 (Given)  todo-projector.ts 的 projectIntendStrike() 从 Strike 创建待办
当   (When)   intend Strike 投影为 todo
那么 (Then)   不走 createTodoTool.handler（因为需要 strike_id 关联 + 事件总线）
并且 (And)    受益于改动 A（时间锚点），时间解析准确性已修复
```

说明：digest 路径的 todo-projector 需要 strike_id 关联、eventBus 事件、goal 粒度判断等 digest 专有逻辑，强行塞入 tool handler 会增加耦合。时间解析的问题通过改动 A 在 prompt 层面统一解决。

---

## 改动 D：待办条目增加目标标签 + 优先级色点

### 现状
- `TaskItem` 只显示文本 + 日期 + 预估时长
- 数据已有 `goal_title`（父目标名称，后端 JOIN）和 `priority`（1-5），但 UI 未展示
- 用户无法一眼看出待办属于哪个目标，也看不到优先级

### 场景 D1: 显示父目标/项目标签
```
假设 (Given)  待办"明天找张总确认报价"属于目标"供应链成本优化"
当   (When)   在时间视图中渲染该待办
那么 (Then)   文本下方 Meta 行显示目标标签（如 "供应链成本优化"）
并且 (And)    标签样式为小型 pill/badge，颜色柔和不喧宾夺主
并且 (And)    无父目标的待办不显示标签
```

### 场景 D2: 优先级色点
```
假设 (Given)  待办 priority=5（高优先级）
当   (When)   在时间视图中渲染该待办
那么 (Then)   待办文本左侧（checkbox 和文本之间）显示一个小圆点
并且 (And)    颜色深浅反映优先级：5=深色(强调), 3=中色, 1=浅色
并且 (And)    priority 为 null 或 3（默认）时不显示色点（避免噪音）
```

### 优先级色点颜色方案

| priority | 含义 | 色点 |
|----------|------|------|
| 5 | 高 | `bg-red-500`（深红） |
| 4 | 较高 | `bg-orange-400` |
| 3 / null | 普通 | 不显示 |
| 2 | 较低 | 不显示 |
| 1 | 低 | 不显示 |

只有 priority >= 4 才显示色点，避免每条待办都有色点造成视觉噪音。

### 修改

`features/todos/components/task-item.tsx`：

```tsx
// Meta 行（文本下方），在 dateLabel/durationLabel 基础上增加：

// 优先级色点：checkbox 与文本之间
{priority >= 4 && (
  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
    priority >= 5 ? "bg-red-500" : "bg-orange-400"
  }`} />
)}

// 目标标签：Meta 行
{todo.goal_title && (
  <span className="truncate max-w-[120px] rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
    {todo.goal_title}
  </span>
)}

---

## 边界条件
- [ ] 跨午夜：用户 23:59 说"今天"，服务器时间已是次日 → buildDateAnchor 基于服务器时间，可能差一天（可接受，后续可用客户端时区修正）
- [ ] "下下周" / "下个月15号" — 不在预计算表中 → prompt 指示"不在表中的相对时间，基于当前日期手动计算"
- [ ] 用户说的时间已过（"昨天"）→ LLM 应如实输出昨天日期，不做顺延
- [ ] 时区问题 — 当前服务器用 UTC，buildDateAnchor 应使用用户本地时区（如何获取？暂用服务器时区）

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `gateway/src/lib/date-anchor.ts` | **新建** | 共享时间锚点生成函数 |
| `gateway/src/handlers/digest-prompt.ts` | 改 | 引用 buildDateAnchor 替换手动日期计算 + 修正示例 |
| `gateway/src/handlers/voice-action.ts` | 改 | 引用 buildDateAnchor + executeCreateTodo 走 tool handler |
| `gateway/src/skills/prompt-builder.ts` | 改 | hot tier 注入时间锚点 |
| `features/todos/components/task-item.tsx` | 改 | 增加优先级色点 + 目标标签 |

## 依赖
- `gateway/src/tools/definitions/create-todo.ts` — 被 voice-action 复用的 handler
- `gateway/src/lib/text-utils.ts` — safeParseJson（已存在）

## 备注
- digest 路径（todo-projector）不改创建逻辑，只受益于 prompt 层面的时间锚点改进
- 改动 A/B/C 可一起实施，改动 D 待讨论后决定
