---
id: "102a"
title: "Voice Routing — Core"
status: completed
domain: voice
risk: high
dependencies: []
superseded_by: null
related: ["voice-todo-ext.md"]
created: 2026-03-23
updated: 2026-04-24
---
# Voice Routing — 上下文感知三层分流

> 状态：🟢 前端→API 管线已接通（fix-voice-todo-pipeline.md 完成） | 优先级：P0
> 依赖：voice-action（已完成）, agent-tool-layer（已完成）
> 替代：voice-action.md 中的路由逻辑（保留工具执行器，替换入口分流）

## 实现核查（2026-04-04）

| 场景 | 状态 | 说明 |
|------|------|------|
| A1 sourceContext 传递 | ✅ 完成 | fab.tsx:79,293 → gateway index.ts:378 → asr.ts:79,118 → process.ts |
| A2 forceCommand 上滑 | ✅ 完成 | fab.tsx:413 swipeUp → asr.stop forceCommand:true → asr.ts:368 |
| B1 Layer 1 待办全能 | ✅ 完成 | process.ts:115-128 → todoFullMode → todo_commands 返回 |
| B2 Layer 2 Agent模式 | ✅ 完成 | process.ts:132-157 → classifyVoiceIntent(true) → executeVoiceAction |
| B3 Layer 3 AI分类 | ✅ 完成 | process.ts:159-415 → buildUnifiedProcessPrompt → 直写Strikes |
| H1 去掉regex预筛 | ✅ 完成 | mayBeAction()定义但未调用，Layer 3全走AI。**待清理死代码** |
| H2 短文本分类 | ✅ 完成 | voice-action.ts:144 阈值 ≤2字(比spec的4字更宽) |
| H3 Digest条件化 | ✅ 不适用 | v3 统一 AI 调用取代了 Strike/Bond/Digest 架构，无需条件化 |
| I1 关闭确认弹窗 | ✅ 完成 | app/page.tsx:358-360 读取 settings.confirm_before_execute → silentExecuteCommands |
| I2 撤销已执行操作 | ✅ 完成 | silentExecuteCommands 内含 showUndoToast，支持 create/complete/modify 三种撤销 |
| 边界:空文本 | ✅ 完成 | app/page.tsx:152 `if (!transcript) break` |
| 边界:AI失败 | ✅ 完成 | CommandSheet errorMessage 状态 + 红色文字展示 |
| 边界:页面切换保持 | ✅ 完成 | CommandSheet在root级渲染，独立于activeOverlay |
| 边界:网络中断 | ✅ 完成 | navigator.onLine + online/offline 事件 → 确认按钮 disable + "网络已断开" |
| 边界:todo+上滑 | ✅ 完成 | process.ts Layer 1检查在Layer 2前，Layer 1优先 |

**核心差距**：后端三层路由+隐藏Record均已完成；前端 confirm_before_execute + 撤销 + AI错误UI 均已接通。剩余：H3 Digest条件化、网络中断处理。

## 概述

当前语音路由依赖正则预筛（ACTION_PATTERNS），导致 57% 的待办意图被误判为 record，走了又慢又不准的 Digest 链路。本 spec 重新设计路由：**利用用户当前页面上下文 + 手势信号，三层分流，待办页全能、上滑全量 Agent、日记页全 AI 分类**。

待办扩展模型（提醒、周期、日历同步等）见 [voice-todo-ext.md](voice-todo-ext.md)。

### 核心变化

1. **前端传递 sourceContext**（当前页面）和 **forceCommand**（上滑手势）
2. **三层路由取代正则预筛**：页面上下文 > 手势信号 > AI 分类
3. **确认弹窗**：所有涉及"执行动作"的结果先展示给用户确认（可在设置中关闭）
4. **弹窗即时弹出**：ASR 完成瞬间弹出（含转写文本 + loading），AI 结果原地回填，消除空窗等待

---

## 1. 前端上下文传递

### 场景 A1: 前端在 asr.start 中传递页面上下文
```
假设 (Given)  用户在待办页面
当   (When)   用户按住 FAB 开始录音
那么 (Then)   前端发送 asr.start { sourceContext: "todo", deviceId, mode }
并且 (And)    sourceContext 取值来自当前活跃页面：
              - "todo"     — 待办页（TodoPanel 打开时）
              - "timeline" — 日记时间线（默认首页）
              - "chat"     — 对话页
              - "review"   — 复盘页
```

### 场景 A2: 上滑手势传递 forceCommand
```
假设 (Given)  用户在任意页面录音中
当   (When)   用户上滑松手
那么 (Then)   前端发送 asr.stop { forceCommand: true }
并且 (And)    forceCommand 与 sourceContext 独立（待办页上滑 = todo + forceCommand）
```

### 接口约定

```typescript
// asr.start payload（修改）
interface AsrStartPayload {
  deviceId: string;
  mode: "realtime" | "upload";
  notebook?: string;
  sourceContext: "todo" | "timeline" | "chat" | "review";  // 新增
}

// asr.stop payload（修改）
interface AsrStopPayload {
  deviceId: string;
  saveAudio?: boolean;
  forceCommand?: boolean;  // 已有定义，前端补接
}
```

---

## 2. 三层路由逻辑

### 路由入口（process.ts 改造）

```
process.ts: processEntry(payload)
  │
  ├─ payload.sourceContext === "todo"
  │   → Layer 1: todoFullMode()
  │
  ├─ payload.forceCommand === true
  │   → Layer 2: agentCommandMode()
  │
  └─ else
      → Layer 3: diaryWithClassification()
```

### 场景 B1: Layer 1 — 待办全能模式（sourceContext=todo）
```
假设 (Given)  用户在待办页面录音
当   (When)   后端收到 process 请求，sourceContext="todo"
那么 (Then)   创建隐藏 record（source="todo_voice", status="completed"）
并且 (And)    单次 AI 调用，提取待办指令：
              - action_type: create | complete | modify | query | batch_create
              - 全量参数（见 voice-todo-ext.md Part 1 接口）
并且 (And)    返回结构化结果给前端（不存日记列表、不触发 Digest）
并且 (And)    前端弹出 TodoCommandSheet 确认弹窗
```

### 场景 B2: Layer 2 — 全量 Agent 模式（forceCommand=true）
```
假设 (Given)  用户在任意页面上滑松手
当   (When)   后端收到 process 请求，forceCommand=true
那么 (Then)   创建隐藏 record（source="command_voice", status="completed"）
并且 (And)    调用全量 ToolRegistry 工具链（所有已注册工具均可用）
并且 (And)    通过 WebSocket 流式推送工具执行状态（tool.status 消息）
并且 (And)    返回最终结果给前端（不存日记列表、不触发 Digest）
并且 (And)    前端弹出 AgentCommandSheet 展示执行过程和结果
```

### 场景 B2a: 指令模式 CommandSheet 空结果/超时兜底 <!-- ✅ completed (fix-command-sheet-stuck) -->
```
假设 (Given)  用户上滑进入指令模式，CommandSheet 已弹出并显示处理中
当   (When)   用户上滑松手后超过 20 秒仍无有效指令结果
那么 (Then)   CommandSheet 显示"未识别到指令，请重试"
并且 (And)    用户可手动关闭后重新录音
```

### 场景 B3: Layer 3 — 日记 + AI 分类（默认路径）
```
假设 (Given)  用户在日记页正常录音（非上滑）
当   (When)   后端收到 process 请求，sourceContext="timeline" 且 forceCommand=false
那么 (Then)   创建正常 record（source="voice"）
并且 (And)    文本清理（已有逻辑不变）
并且 (And)    AI 意图分类（去掉 ACTION_PATTERNS 正则预筛，全部走 AI 分类）
              - action → 返回执行结果（前端弹确认弹窗）+ 不 Digest
              - mixed  → 返回执行结果（前端弹确认弹窗）+ Digest 记录部分
              - record → 存日记 + 条件 Digest（阈值待测试确定）
```

---

## 3. Layer 3 改造 — 去掉正则预筛

### 场景 H1: 去掉 ACTION_PATTERNS 预筛
```
假设 (Given)  用户在日记页正常录音
当   (When)   文本进入 Layer 3 分类
那么 (Then)   不再调用 mayBeAction() 正则预筛
并且 (And)    全部文本直接送 AI 意图分类器（classifyVoiceIntent）
并且 (And)    AI 分类结果：record / action / mixed
```

### 场景 H2: 短文本（≤4字）也参与分类
```
假设 (Given)  用户说"买牛奶"（3字）
当   (When)   文本进入 Layer 3
那么 (Then)   不因长度跳过分类（移除 text.length > 4 的阈值判断）
并且 (And)    AI 能正确将"买牛奶"分类为 action/create_todo
```

### 场景 H3: Digest 条件化（阈值待测试）
```
假设 (Given)  Layer 3 中 AI 分类为 record
当   (When)   文本长度 ≤ N 字（N 待测试确定，初始设 50）
那么 (Then)   轻量 Digest：限 1-2 个 Strike，不建 Bond
当   (When)   文本长度 > N 字
那么 (Then)   完整 Digest：正常拆解 Strike + Bond
```

---

## 4. 用户设置

### 新增设置项

```typescript
interface UserSettings {
  // 已有设置...

  /** 执行动作前弹窗确认（默认 true） */
  confirm_before_execute: boolean;
}
```

### 场景 I1: 关闭确认弹窗
```
假设 (Given)  用户在设置中将"执行前确认"设为关闭
当   (When)   Layer 1/2/3 产生待执行动作
那么 (Then)   后台静默执行
并且 (And)    完成后底部 toast 通知 "[撤销]" 按钮（5秒有效）
```

### 场景 I2: 撤销已执行操作
```
假设 (Given)  用户关闭了确认弹窗，系统静默创建了一条待办
当   (When)   用户在 5 秒内点击 toast 的 [撤销]
那么 (Then)   删除刚创建的待办
并且 (And)    toast 更新为"已撤销"
```

---

## 边界条件

- [x] ASR 返回空文本 → 不弹弹窗，不处理 — `app/page.tsx:152`
- [x] AI 提取失败（JSON 解析出错）→ 弹窗显示错误消息 + 20秒超时保护 — command-sheet.tsx error phase
- [x] 弹窗打开期间用户切换页面 → 弹窗保持（不因页面切换消失）— root级渲染
- [x] 弹窗打开期间网络中断 → 确认按钮 disable，显示"网络已断开" — command-sheet.tsx offline 状态
- [x] 并发录音（极端场景）→ 每次录音独立创建 record，互不影响
- [x] 待办页上滑（sourceContext=todo + forceCommand=true）→ Layer 1 优先 — process.ts:115在132前

## 关键文件变更

| 文件 | 变更 |
|------|------|
| **后端路由** | |
| `gateway/src/handlers/process.ts` | 三层路由入口改造（Layer 1/2/3 分流） |
| `gateway/src/handlers/voice-action.ts` | 去掉 ACTION_PATTERNS 预筛；Layer 3 全走 AI 分类 |
| `gateway/src/index.ts` | 解析 asr.start 中的 sourceContext；转发给 process |
| **前端录音** | |
| `features/recording/components/fab.tsx` | 发送 sourceContext + forceCommand |
| `features/recording/hooks/use-fab-gestures.ts` | 上滑手势传递 forceCommand |
| **设置** | |
| `shared/lib/local-config.ts` | 新增 confirm_before_execute 设置项 |

## 依赖

- voice-action（已完成）— 保留工具执行器，替换入口路由
- agent-tool-layer（已完成）— ToolRegistry 全量工具
