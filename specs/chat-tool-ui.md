---
id: "116"
title: "Chat 工具调用 UI 重构"
status: completed
domain: chat
risk: medium
dependencies: ["chat-system.md"]
superseded_by: null
created: 2026-04-06
updated: 2026-04-06
---

# Chat 工具调用 UI 重构

## 概述

当前工具调用以临时 `tool-status` 消息呈现，无入场/退场动画，完成后直接移除不留痕迹。本 spec 将工具调用渲染升级为业界标准的 **Parts 内嵌模型 + Collapsible 卡片 + Shimmer 动画**，提升 AI 工作透明度和交互质感。

### 技术背景（社区调研）

| 项目 | 容器 | 运行态 | 完成态 | 展开/收起 | 动画 |
|------|------|--------|--------|----------|------|
| Vercel AI Chatbot | Radix Collapsible | shimmer 文字 + pulse 图标 | 绿色 check | CSS slide | motion（仅 shimmer） |
| Lobe Chat | AccordionItem | ShinyText + 实时计时器 | 绿色 check | 手风琴 | 纯 CSS keyframes |
| Open WebUI | 点击展开 inline | Spinner + shimmer | CheckCircle | Svelte slide | 纯 CSS |
| LibreChat | 紧凑 inline + grid 展开 | shimmer + 假进度 | 文字切换 | CSS grid(0.3s) | 纯 CSS |
| ChatGPT/Claude.ai | 极简 inline pill | shimmer/pulse | pill 文字切换 | 内联展开 | 纯 CSS |

**设计决策**：
- **shimmer 文字**是行业标配运行态动画，纯 CSS 实现
- **结果 inline 展开**，不用 modal
- **不引入 framer-motion**，纯 CSS keyframes + Tailwind animate 保持轻量
- **类型化图标**区分工具种类

---

## 1. 数据模型：Parts 内嵌

### 场景 1.1: 工具状态嵌入 assistant 消息的 parts 数组
```
假设 (Given)  AI 回复过程中触发了工具调用
当   (When)   gateway 发送 tool.status 消息
那么 (Then)   工具调用状态作为 part 追加到当前 assistant 消息的 parts 数组中
并且 (And)    不再创建独立的 tool-status 消息
并且 (And)    part 类型为 { type: "tool-call", toolName, label, status: "running" }
```

### 场景 1.2: 工具完成时状态就地切换
```
假设 (Given)  assistant 消息的 parts 中有一个 status="running" 的 tool-call part
当   (When)   gateway 发送 chat.done 或下一个 chat.chunk
那么 (Then)   该 tool-call part 的 status 就地切换为 "done"
并且 (And)    保留在 parts 数组中，不被移除
并且 (And)    用户可以回看历史消息中的工具调用记录
```

### 场景 1.3: 工具执行出错
```
假设 (Given)  工具执行过程中发生错误
当   (When)   gateway 发送 error 或 chat.done
那么 (Then)   tool-call part 的 status 切换为 "error"
并且 (And)    保留错误信息供用户查看
```

**接口约定**：

```typescript
// ChatMessage.parts 类型定义
type MessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      label: string;                     // 用户可读标签，如 "正在联网搜索…"
      status: "running" | "done" | "error";
      result?: string;                   // 完成后的简要结果
      durationMs?: number;               // 执行耗时
    }
  | { type: "step-start" };             // 多步工具链分隔符（预留）

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "plan";
  content: string;                       // 纯文本内容（向后兼容）
  parts?: MessagePart[];                 // 结构化内容（新增）
  timestamp: Date;
  plan?: { /* ... existing ... */ };
}
```

**use-chat.ts 改造要点**：
- `tool.status` 事件 → 在当前 streaming assistant 消息的 `parts` 数组中追加 `tool-call` part
- `chat.chunk` 事件 → 更新 `parts` 中最后一个 `text` part，或追加新的 `text` part
- `chat.done` 事件 → 将所有 `status: "running"` 的 tool-call parts 切换为 `"done"`，不再 filter 消息
- 移除 `role: "tool-status"` 类型，ChatMessage.role 去掉此值

---

## 2. 工具卡片渲染

### 场景 2.1: 运行态 — shimmer 动画 + 类型化图标
```
假设 (Given)  assistant 消息的 parts 中有一个 status="running" 的 tool-call
当   (When)   渲染该 part
那么 (Then)   显示一个紧凑卡片：[类型图标(pulse)] + [shimmer 文字标签]
并且 (And)    shimmer 使用品牌色 --deer 的渐变滑动动画
并且 (And)    卡片有圆角和微妙背景（bg-surface-low）
```

### 场景 2.2: 完成态 — 折叠摘要，可展开详情
```
假设 (Given)  tool-call part 的 status 为 "done"
当   (When)   渲染该 part
那么 (Then)   显示为一行紧凑摘要：[绿色 ✓] + [工具名] + [耗时（可选）]
并且 (And)    点击可展开/折叠查看执行结果
并且 (And)    默认折叠
并且 (And)    展开/折叠有 CSS slide 过渡动画（150ms ease-out）
```

### 场景 2.3: 错误态
```
假设 (Given)  tool-call part 的 status 为 "error"
当   (When)   渲染该 part
那么 (Then)   显示为：[红色 ✕] + [工具名] + "执行失败"
并且 (And)    点击可展开查看错误详情
```

### 场景 2.4: 多工具分组
```
假设 (Given)  一个 assistant 消息的 parts 中有连续多个 tool-call
当   (When)   所有 tool-call 都已完成
那么 (Then)   折叠为一行摘要："路路用了 N 个工具"
并且 (And)    点击展开显示每个工具的独立卡片
并且 (And)    运行中时不分组，逐个显示
```

**类型化图标映射**：

| toolName | 图标 | 颜色 |
|----------|------|------|
| web_search | Globe | blue |
| fetch_url | Globe | blue |
| search | Search | deer |
| create_todo | SquarePen | green |
| update_todo | SquarePen | green |
| create_goal | Target | amber |
| update_goal | Target | amber |
| create_project | FolderOpen | amber |
| delete_record | Trash2 | red |
| 其他 | Wrench | muted |

---

## 3. Shimmer 动画

### 场景 3.1: shimmer 文字效果
```
假设 (Given)  工具正在执行（status="running"）
当   (When)   渲染工具标签文字
那么 (Then)   文字使用 background-clip: text + 渐变滑动动画
并且 (And)    渐变从 muted-foreground → deer → muted-foreground
并且 (And)    动画周期 1.5s，infinite，linear
并且 (And)    纯 CSS @keyframes 实现，不引入 JS 动画库
```

**CSS 实现**：
```css
@keyframes shimmer-text {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.shimmer-text {
  background: linear-gradient(
    120deg,
    var(--muted-foreground) 30%,
    var(--deer) 50%,
    var(--muted-foreground) 70%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer-text 1.5s linear infinite;
}
```

### 场景 3.2: 图标 pulse 动画
```
假设 (Given)  工具正在执行
当   (When)   渲染工具类型图标
那么 (Then)   图标使用 animate-pulse（opacity 0.5→1 循环）
并且 (And)    完成后 pulse 停止，图标切换为对应完成态图标
```

---

## 4. 展开/折叠交互

### 场景 4.1: CSS-only 展开折叠
```
假设 (Given)  工具卡片处于折叠状态
当   (When)   用户点击卡片
那么 (Then)   详情区域从 max-height:0 过渡到实际高度
并且 (And)    同时 opacity 0→1
并且 (And)    过渡时长 150ms ease-out
并且 (And)    Chevron 图标旋转 180°
```

**实现方案**：使用 CSS `grid-template-rows: 0fr → 1fr` 过渡（比 max-height hack 更平滑，无需预设最大高度），配合 `overflow: hidden`。

```css
.tool-detail-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 150ms ease-out;
}
.tool-detail-wrapper[data-open="true"] {
  grid-template-rows: 1fr;
}
.tool-detail-inner {
  overflow: hidden;
}
```

---

## 5. Gateway 协议增强

### 场景 5.1: tool.status 携带更多元数据
```
假设 (Given)  gateway 后端执行工具调用
当   (When)   发送 tool.status WebSocket 消息
那么 (Then)   payload 包含 { toolName, label, callId }
并且 (And)    callId 用于关联同一次调用的 status → done 状态
```

### 场景 5.2: tool.done 新消息类型
```
假设 (Given)  gateway 后端工具执行完成
当   (When)   工具返回结果
那么 (Then)   发送 tool.done 消息：{ toolName, callId, success, message, durationMs }
并且 (And)    前端收到后将对应 callId 的 part status 切换为 "done" 或 "error"
并且 (And)    填充 result 和 durationMs 字段
```

**协议变更**：

```typescript
// 现有 — 保持兼容
{ type: "tool.status", payload: { toolName: string; label: string } }

// 新增字段
{ type: "tool.status", payload: { toolName: string; label: string; callId: string } }

// 新增消息类型
{ type: "tool.done", payload: { toolName: string; callId: string; success: boolean; message: string; durationMs: number } }
```

**gateway 改造要点**：
- `streamWithTools()` 中，工具开始执行前 yield `\x00TOOL_STATUS:${name}:${label}:${callId}`
- 工具执行完成后 yield `\x00TOOL_DONE:${name}:${callId}:${success}:${message}:${durationMs}`
- `index.ts` 解析新标记，发送对应 WebSocket 消息

---

## 6. 清理遗留代码

### 场景 6.1: 移除 tool-status 消息类型
```
假设 (Given)  新 parts 模型上线
当   (When)   工具调用通过 parts 渲染
那么 (Then)   ChatMessage.role 移除 "tool-status" 值
并且 (And)    use-chat.ts 中不再创建 role="tool-status" 的独立消息
并且 (And)    chat-bubble.tsx 中移除 isToolStatus 分支
并且 (And)    chat.done 不再 filter tool-status 消息
```

### 场景 6.2: 替换 ToolSteps 组件
```
假设 (Given)  features/chat/components/tool-steps.tsx 当前未被使用
当   (When)   新的 ToolCallCard 组件完成
那么 (Then)   删除 tool-steps.tsx 文件
并且 (And)    新组件为 features/chat/components/tool-call-card.tsx
```

---

## 7. ChatBubble 渲染适配

### 场景 7.1: ChatBubble 支持 parts 渲染
```
假设 (Given)  一条 assistant 消息包含 parts 数组
当   (When)   ChatBubble 渲染此消息
那么 (Then)   按 parts 数组顺序渲染每个 part：
             - text part → MarkdownContent 渲染
             - tool-call part → ToolCallCard 渲染
             - step-start part → 水平分隔线
并且 (And)    如果 parts 为空/undefined，fallback 到 content 字符串渲染（向后兼容）
```

### 场景 7.2: 流式文本与工具调用交替
```
假设 (Given)  AI 先输出文字，然后调用工具，然后继续输出文字
当   (When)   渲染此消息
那么 (Then)   parts 为 [text, tool-call, text]
并且 (And)    三个 part 依次渲染，工具卡片嵌在文字之间
并且 (And)    视觉上自然连贯
```

---

## 边界条件

- [ ] 工具调用 0 次（纯文字回复）：parts 只有 text，或 parts undefined → fallback content
- [ ] 单次工具调用：显示单独卡片，不分组
- [ ] 并行多次工具调用（同一 step）：逐个显示，完成后可分组折叠
- [ ] 串行多次工具调用（跨 step）：text + tool + text + tool 交替渲染
- [ ] 工具执行超时（gateway 25s timeout）：status 保持 running → chat.done 后切为 error
- [ ] 网络断线：部分 tool-call parts 可能停留在 running 状态 → disconnect 时统一标记 error
- [ ] 历史消息回显：重新进入聊天页时，已完成的工具调用 parts 应正确渲染为折叠态
- [ ] PC 端浏览器：同样适用，无移动端特殊逻辑
- [ ] 深色/浅色主题：shimmer 颜色跟随 CSS 变量自适应

## 依赖

- `features/chat/hooks/use-chat.ts` — 数据模型改造
- `features/chat/components/chat-bubble.tsx` — 渲染适配
- `features/chat/lib/gateway-client.ts` — 消息类型扩展
- `gateway/src/ai/provider.ts` — tool status/done 标记增强
- `gateway/src/index.ts` — WebSocket 消息解析扩展
- Lucide React 图标（已有依赖，无需新增）

## Implementation Phases (实施阶段)

- [x] **Phase 1: 数据模型 + use-chat 改造** — ✅ 2026-04-06 ChatMessage 加 parts 字段；use-chat.ts tool.status→parts 追加；tool.done→就地切换；chat.done→running→done；移除 tool-status role
- [x] **Phase 2: Gateway 协议增强** — ✅ 2026-04-06 streamWithTools 添加 callId 到 TOOL_STATUS + 新增 TOOL_DONE 标记；index.ts 解析两种新标记发送 tool.status(callId) + tool.done 消息
- [x] **Phase 3: ToolCallCard 组件** — ✅ 2026-04-06 新建 tool-call-card.tsx 三态渲染；18 工具类型化图标；shimmer CSS 文字动画；CSS grid 展开/折叠
- [x] **Phase 4: ChatBubble 适配 + 分组** — ✅ 2026-04-06 ChatBubble 按 parts 分发渲染（text→Markdown, tool-call→Card/Group）；连续 tool-call 自动分组折叠；删除 tool-steps.tsx
- [x] **Phase 5: 样式打磨 + 测试** — ✅ 2026-04-06 shimmer 颜色改用 CSS 变量 --shimmer-accent 适配深浅主题；36 个测试全部通过（tool-call-card 13 + chat-bubble 7 + use-chat-parts 9 + use-chat-done-empty 1 + gateway-client 6）

## 备注

- 不引入 framer-motion，所有动画纯 CSS keyframes + Tailwind animate，与项目现有风格一致
- shimmer 文字动画是业界标配（Vercel/Lobe/Open WebUI/LibreChat 全部使用），用户感知最自然
- CSS `grid-template-rows: 0fr→1fr` 比 max-height hack 更优雅，Safari 14+ / Chrome 57+ 支持
- gateway 协议改动向后兼容：新增 callId 字段和 tool.done 消息，旧字段保留
- `step-start` part 类型预留，本次不实现，为未来多步工具链分隔做准备
- LibreChat 的假进度条模式有趣但不急需，可后续考虑
- Lobe Chat 的实时计时器（requestAnimationFrame）成本低，Phase 3 可顺带实现
