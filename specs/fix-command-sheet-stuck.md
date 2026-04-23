---
id: fix-command-sheet-stuck
title: "Fix: 上滑指令 CommandSheet 堵塞无响应"
status: completed
backport: voice-routing.md#场景 B2a
domain: voice
risk: medium
dependencies: ["voice-routing.md", "voice-todo-ext.md"]
superseded_by: null
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 上滑指令 CommandSheet 堵塞无响应

## Bug 现象
用户在录音时上滑触发指令模式后，长时间无响应/堵塞。具体表现：
1. 上滑松手后无即时反馈，需等 ASR 完成才看到 CommandSheet 打开
2. CommandSheet 打开后显示"路路正在分析语音指令..."，AI 分类需要 5-15 秒
3. **最严重**：如果 AI 分类超时/返回空结果，CommandSheet 永远卡在"processing"阶段，无法自动关闭或显示错误

## 根因分析

### 问题 1（核心）: Layer 2 双阶段串行 AI 调用导致慢
- Layer 2 调用 `classifyVoiceIntent()` 做意图分类（1 次 AI 调用，3-15 秒）
- 分类后对每个 action 逐个 `matchTodoByHint()`（DB 查询）或 `executeVoiceAction()`（可能再 1 次 AI 调用）
- **总耗时 5-20 秒**
- 而 Layer 1（`todoFullMode`）单次 AI 调用含待办+目标上下文，直接返回 commands，仅需 2-5 秒
- **关键洞察**：用户上滑 = 明确表达"这是指令"，无需再做 record/action 分类。应单阶段完成

### 问题 2: CommandSheet processing 死锁
- 当 Layer 2 返回空 actions 时，`result.todo_commands` 为 undefined
- app/page.tsx 的 handler 两个分支都不命中，CommandSheet 永远停在 `"processing"`

### 问题 3: 上滑松手后无即时反馈
- `finishRecording(true)` 发送 `asr.stop`，不设置任何视觉状态
- 录音 UI 回到 idle，到 `asr.done` 到达前无反馈

## 修复方案

### Fix A（核心）: Layer 2 双阶段合并为单阶段 AI 调用
**文件**: `gateway/src/handlers/process.ts`, `gateway/src/handlers/voice-action.ts`

当前 Layer 2 的慢在于：先调 `classifyVoiceIntent`（无上下文的分类 prompt），再逐个 action 调 `matchTodoByHint`/`executeVoiceAction`。

修复：新建 `commandFullMode` 函数（参考 `todoFullMode` 的单阶段模式），支持上滑指令的完整工具集：

**上滑指令工具集（4 类）：**
- **待办**：create_todo / complete_todo / modify_todo / delete_todo / query_todo
- **日记**：create_record / update_record / delete_record / query_record
- **搜索**：search（全文检索日记/待办/目标）
- **文件夹**：manage_folder（创建/重命名/删除）/ move_record（移动日记到文件夹）

**实现方式：**
1. 预加载上下文：待办列表 + 目标列表 + 文件夹列表
2. 构建包含上下文的单次 prompt（`buildCommandFullPrompt`），AI 直接返回 commands + target_id
3. 单次 AI 调用完成所有工作
4. 仅对 query/search 类型做后处理（DB 查询填充结果）

**与 todoFullMode 的区别：**
- todoFullMode 仅支持 todo 四种操作
- commandFullMode 支持待办+日记+搜索+文件夹四大类
- prompt 更大但仍是单次 AI 调用，远快于当前的多次串行调用

预期耗时从 5-20 秒降到 2-5 秒

### Fix B: CommandSheet processing 超时 + 空结果处理
**文件**: `app/page.tsx`

在 `process.result` handler 末尾，增加兜底：当 CommandSheet 已打开但无 `todo_commands` 也无 `action_results` 时：
- `payload.error` 存在 → 传递错误给 CommandSheet
- 无 error 但无 commands → 传递空状态

**文件**: `features/todos/components/command-sheet.tsx`

添加 processing 超时机制：
- 打开后 20 秒仍在 `phase="processing"` → 自动切换到错误状态
- 新增 "empty" 和 "error" phase 的 UI

### Fix C: 上滑后即时反馈
**文件**: `features/recording/components/fab.tsx`

在 `finishRecording(true)` 的上滑路径中，发送 `asr.stop` 后立即显示 `fabNotify.info("指令处理中...")`。

## 场景

### 1. CommandSheet 超时保护

### 场景 1.1: AI 分类返回空结果 → 显示"未识别到指令"
```
假设 (Given)  用户上滑触发指令模式
当   (When)   用户说完一段不含指令的话并松手
那么 (Then)   CommandSheet 显示"未识别到指令，请重新说"提示
并且 (And)    提供关闭按钮，用户可手动关闭
```

### 场景 1.2: AI 分类超时/失败 → 显示错误
```
假设 (Given)  用户上滑触发指令模式，CommandSheet 已打开
当   (When)   系统收到后端返回的错误信息
那么 (Then)   CommandSheet 展示错误提示文案
并且 (And)    用户可手动关闭后重新录音
```

### 场景 1.3: CommandSheet processing 超时保护
```
假设 (Given)  CommandSheet 已打开且处于处理中阶段
当   (When)   到达 20 秒仍未收到有效结果
那么 (Then)   CommandSheet 自动切换为"指令处理超时，请重试"
并且 (And)    提供关闭按钮
```

### 2. 上滑即时反馈

### 场景 2.1: 上滑松手后立即提示
```
假设 (Given)  用户正在录音
当   (When)   用户上滑松手触发指令模式
那么 (Then)   FAB 显示"指令处理中..."的提示
并且 (And)    通知在 CommandSheet 打开后自动消失（或 2 秒后消失）
```

### 3. 静默执行模式的空结果处理

### 场景 3.1: 静默模式下 AI 返回空结果 → 通知用户
```
假设 (Given)  用户关闭了执行前确认（静默模式）
当   (When)   用户上滑说完一段不含指令的话
那么 (Then)   FAB 显示"未识别到指令"提示
并且 (And)    不弹出 CommandSheet
```

### 4. 正常流程不受影响

### 场景 4.1: AI 分类正常返回 → CommandSheet 正常显示结果
```
假设 (Given)  用户上滑说了"帮我创建一个明天开会的待办"
当   (When)   用户上滑松手后说完
那么 (Then)   CommandSheet 从处理中切换到结果阶段
并且 (And)    显示待办创建确认卡片
```

## 验收行为（E2E 锚点）

> 涉及 WebSocket + AI 调用的实时流程，以手动测试 + 单元测试为主。

### 行为 1: 上滑指令完整流程
1. 用户在首页长按 FAB 开始录音
2. 说"帮我创建一个明天开会的待办"
3. 上滑松手
4. 应立即看到"指令处理中..."提示
5. CommandSheet 弹出显示加载状态
6. 几秒后显示待办创建确认卡片

### 行为 2: 空指令处理
1. 用户在首页长按 FAB 开始录音
2. 说一些非指令内容（如"今天天气真好"）
3. 上滑松手
4. CommandSheet 弹出显示加载状态
5. 应显示"未识别到指令"提示，而非永远加载

## 边界条件
- [x] AI 分类返回空 actions → 显示"未识别到指令"
- [x] AI 分类超时（15 秒）→ process.result 仍返回但无 commands → 显示错误
- [x] process.result 完全不到达（WebSocket 断连）→ 20 秒超时保护
- [x] 用户主动关闭 CommandSheet → 正常关闭，无副作用
- [x] 快速连续上滑 → 新的 CommandSheet 覆盖旧的

## 接口约定

### process.result payload 现有结构（不变）
```typescript
interface ProcessResult {
  todo_commands?: TodoCommand[];  // Layer 2 有效指令
  action_results?: ActionExecResult[];  // 查询结果
  error?: string;  // 错误信息
  voice_intent_type?: string;
}
```

### CommandSheet 新增状态
```typescript
type SheetPhase = "transcribing" | "processing" | "result" | "detail" | "empty" | "error";
// 保留现有 "transcribing"（虽然当前未使用），新增 "empty"（无指令）和 "error"（超时/失败）
```

### 超时机制
- 使用 useEffect + setTimeout，依赖 `[open, phase]`
- 当 `open=true && phase="processing"` 时启动 20 秒计时器
- phase 变化或 sheet 关闭时 clearTimeout
- 超时后设置 `phase="error"`，不需要"重试"按钮（用户关闭后重新录即可）

## 接口约定

### commandFullMode 返回结构（复用 ProcessResult）
```typescript
// 新增 command 类型（扩展 TodoCommand 或新建 CommandItem）
interface CommandItem {
  action_type: 
    // 待办
    | "create_todo" | "complete_todo" | "modify_todo" | "delete_todo" | "query_todo"
    // 日记
    | "create_record" | "update_record" | "delete_record" | "query_record"
    // 搜索
    | "search"
    // 文件夹
    | "manage_folder" | "move_record";
  confidence: number;
  target_hint?: string;
  target_id?: string;
  // 各类型专属字段
  todo?: { text: string; scheduled_start?: string; priority?: number; /* ... */ };
  record?: { content: string; notebook?: string };
  changes?: Record<string, any>;
  query_params?: Record<string, any>;
  query_result?: any[];
  folder?: { action: "create" | "rename" | "delete"; name: string; new_name?: string };
  move?: { record_id: string; target_folder: string };
}
```

### process.result payload（不变）
CommandItem 通过 `result.todo_commands` 字段返回（复用现有通道，前端 CommandSheet 按 action_type 渲染）。

## Implementation Phases
- [ ] Phase 1: 新建 `gateway/src/handlers/command-full-prompt.ts` — 构建含上下文的全量指令 prompt
- [ ] Phase 2: 新建 `commandFullMode` 函数（process.ts 或独立文件）— 预加载上下文 + 单次 AI + 后处理
- [ ] Phase 3: process.ts — Layer 2 替换为调用 commandFullMode
- [ ] Phase 4: app/page.tsx — process.result handler 增加兜底（空 commands + error 处理）
- [ ] Phase 5: command-sheet.tsx — 新增 "empty"/"error" phase UI + 20 秒超时 + 扩展 action_type 渲染
- [ ] Phase 6: fab.tsx — 上滑松手后 fabNotify.info("指令处理中...")

## 涉及文件
- `gateway/src/handlers/command-full-prompt.ts`（新建）— 全量指令 prompt
- `gateway/src/handlers/process.ts` — Layer 2 重构为 commandFullMode
- `app/page.tsx` — process.result handler 兜底
- `features/todos/components/command-sheet.tsx` — empty/error phase + 扩展渲染
- `features/recording/components/fab.tsx` — 上滑即时反馈

## 备注
- `classifyVoiceIntent` 不修改，Layer 3 仍使用原逻辑
- `matchTodoByHint`/`executeVoiceAction` 不删除（Layer 3 使用）
- commandFullMode prompt 包含待办列表+文件夹列表，AI 直接匹配 target_id，无需二次查询
- CommandSheet 需要适配新增的 action_type（日记、搜索、文件夹操作的确认 UI）
- 本次修复与 fix-recording-notify-stale 无冲突
