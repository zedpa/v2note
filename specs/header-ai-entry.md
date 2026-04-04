---
status: superseded
superseded_by: "chat-system.md"
---

# Header 路路 AI 入口 + 全局后台处理状态

> 状态：🟡 待开发

## 概述
在 WorkspaceHeader 搜索图标左侧添加路路（鹿）图标作为 AI 聊天入口。路路图标同时作为**全局 AI 后台处理状态指示器**——只要后台有 AI 管道在运行（process → digest → todo 投影 → 待办创建），图标就持续动画，直到所有后台工作完成。

## 核心问题

用户提交内容后，后台 AI 管道是**多阶段异步**的：

```
用户提交 → process(清理) → process.result → digest(Strike分解) → todo-projector(待办投影) → todo.created
           ~2s               ↑ 前端目前在这里就结束了    ~6s                ~0.5s
                             但用户看不到待办出现
```

当前 FAB 在 `process.result` 就显示"处理完成"，但 digest + todo 投影还在跑。用户困惑：说了创建待办，显示完成了，但待办列表里没有。

**解法**：路路图标追踪整个管道生命周期——从用户提交开始，到最终的 `todo.created`（或管道静默结束）为止。

## 现状资源

- Gateway 已通过 WebSocket 发送 `todo.created` 事件（`index.ts:183-200`），前端 `input-bar.tsx:119` 已监听
- FAB 监听 `asr.done` / `process.result` / `error`，但**不监听 `todo.created`**
- `components/brand/lulu-logo.tsx` — 路路鹿 SVG 组件，支持 `size`、`variant`（light/dark/color）
- Header 当前布局：`[头像] [日记|待办] [🔍搜索] [🔔通知]`

## 场景

### 场景 1: 路路图标作为 AI 聊天入口
```
假设 (Given)  用户在主页面（日记或待办 Tab）
当   (When)   点击 Header 中的路路图标
那么 (Then)   直接打开 ChatView（mode="command"），等同于输入 `/`
并且 (And)    `/` 输入框快捷方式保留不变
```

**修改点**：
- `workspace-header.tsx`：新增 `onChatClick` prop，搜索图标左侧添加路路按钮
- `app/page.tsx`：传入 `onChatClick={() => handleOpenCommandChat("/")}`
- Header 布局变为：`[头像] [日记|待办] [🦌路路] [🔍搜索] [🔔通知]`

### 场景 2: 录音 → 全管道处理状态
```
假设 (Given)  用户完成录音，"明天去找张总"
当   (When)   ASR 返回 asr.done
那么 (Then)   路路图标立即切换为处理中动画
并且 (And)    FAB 处理胶囊同时展示（保持现有行为）

当   (When)   process.result 返回（summary 保存完毕）
那么 (Then)   路路图标仍然保持处理中（digest 还在跑）
并且 (And)    FAB 胶囊按现有逻辑消失

当   (When)   digest 完成，todo-projector 创建了待办
那么 (Then)   收到 WebSocket `todo.created` 事件
并且 (And)    路路图标恢复静态
```

### 场景 3: 文本输入 → 全管道处理状态
```
假设 (Given)  用户通过输入框提交"帮我记一下明天开会"
当   (When)   createManualNote 请求发出
那么 (Then)   路路图标切换为处理中

当   (When)   HTTP 响应返回（record 创建成功，process 启动）
那么 (Then)   路路图标仍然保持处理中（后台 process + digest 在跑）

当   (When)   后台管道完成（todo.created 或无更多事件 + 超时归零）
那么 (Then)   路路图标恢复静态
```

### 场景 4: 附件上传 / URL 导入
```
假设 (Given)  用户上传图片或导入 URL
当   (When)   请求发出
那么 (Then)   路路图标切换为处理中
并且 (And)    请求完成后（ingest API 返回），后台 digest 可能还在跑
并且 (And)    管道最终完成后恢复静态
```

### 场景 5: 管道无产出的静默结束
```
假设 (Given)  用户输入"今天天气不错"（纯 feel/perceive，不会产生 todo）
当   (When)   process + digest 完成但没有 todo.created 事件
那么 (Then)   路路图标在安全超时（8 秒无新事件）后恢复静态
并且 (And)    不会永远卡在处理中
```

### 场景 6: 绝对安全超时
```
假设 (Given)  路路图标处于处理中
当   (When)   已持续 30 秒无任何事件
那么 (Then)   强制恢复静态
```

## 实现方案

### 全局 AI 处理状态 store

新建 `shared/lib/ai-processing.ts`：

```typescript
/**
 * 全局 AI 后台处理状态。
 * 使用引用计数：多个并发管道各自 start/end，count>0 即为处理中。
 * 带自动衰减：每次 start 启动 8s 衰减计时器，若无 renew 则 count--。
 * 带绝对超时：30s 强制归零。
 */

type Listener = (processing: boolean) => void;
const listeners = new Set<Listener>();
let _count = 0;
let _absoluteTimer: ReturnType<typeof setTimeout> | null = null;
const _decayTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  const processing = _count > 0;
  for (const cb of listeners) cb(processing);
}

/** 生成唯一管道 ID */
let _seq = 0;
function nextId(): string { return `p${++_seq}`; }

/**
 * 开始一个 AI 处理管道，返回 pipelineId。
 * 8s 后无 renew/end 会自动衰减。
 */
export function startAiPipeline(): string {
  const id = nextId();
  _count++;
  notify();

  // 衰减计时器：8s 内若无 renew/end 自动 count--
  _decayTimers.set(id, setTimeout(() => endAiPipeline(id), 8000));

  // 绝对超时：30s 强制归零
  if (!_absoluteTimer) {
    _absoluteTimer = setTimeout(() => {
      _count = 0;
      _decayTimers.forEach(t => clearTimeout(t));
      _decayTimers.clear();
      _absoluteTimer = null;
      notify();
    }, 30000);
  }

  return id;
}

/**
 * 续期管道（收到中间事件时调用，如 process.result）。
 * 重置 8s 衰减计时器。
 */
export function renewAiPipeline(id: string) {
  const existing = _decayTimers.get(id);
  if (existing) clearTimeout(existing);
  _decayTimers.set(id, setTimeout(() => endAiPipeline(id), 8000));
}

/**
 * 结束管道（收到终态事件时调用，如 todo.created / error）。
 */
export function endAiPipeline(id: string) {
  if (!_decayTimers.has(id)) return; // 已结束
  clearTimeout(_decayTimers.get(id)!);
  _decayTimers.delete(id);
  _count = Math.max(0, _count - 1);
  if (_count === 0 && _absoluteTimer) {
    clearTimeout(_absoluteTimer);
    _absoluteTimer = null;
  }
  notify();
}

export function isAiProcessing(): boolean {
  return _count > 0;
}

export function onAiProcessingChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
```

**核心设计**：
- **引用计数**（非布尔值）：多个并发管道互不干扰
- **8s 衰减超时**：管道无产出（纯 perceive/feel，无 todo.created）时自动结束，不卡死
- **renew 续期**：中间事件（process.result）重置衰减计时器，让 digest 有时间跑完
- **30s 绝对超时**：兜底，防止任何情况下卡死

### 事件流映射

**录音流**（WebSocket 事件驱动）：
```
asr.done         → startAiPipeline() → pipelineId
process.result   → renewAiPipeline(pipelineId)    // 不结束，digest 还在跑
todo.created     → endAiPipeline(pipelineId)       // 真正结束
error            → endAiPipeline(pipelineId)
无事件 8s        → 自动衰减结束（纯记录型，不产生 todo）
```

**文本输入流**（HTTP + WebSocket 混合）：
```
handleSubmit     → startAiPipeline() → pipelineId
HTTP response    → renewAiPipeline(pipelineId)    // 后台 process+digest 在跑
todo.created(WS) → endAiPipeline(pipelineId)
无事件 8s        → 自动衰减结束
```

**附件/URL 流**（纯 HTTP）：
```
api.post start   → startAiPipeline() → pipelineId
api.post done    → renewAiPipeline(pipelineId)    // ingest 后可能触发 digest
todo.created(WS) → endAiPipeline(pipelineId)
无事件 8s        → 自动衰减结束
```

### FAB 对 todo.created 事件的响应

当前 FAB 不监听 `todo.created`。需要在 FAB WebSocket handler 中添加对此事件的处理，用于结束全局管道。

### 路路图标动画

空闲态：
```tsx
<LuluLogo size={20} />
```

处理中态：
```tsx
<span className="relative flex items-center justify-center w-9 h-9">
  <span className="absolute w-5 h-5 rounded-full border-2 border-deer/40 animate-ping" />
  <LuluLogo size={20} className="animate-pulse" />
</span>
```

## 修改文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `shared/lib/ai-processing.ts` | **新建** | 全局 AI 管道状态 store（引用计数 + 衰减 + 绝对超时） |
| `features/workspace/components/workspace-header.tsx` | 修改 | 新增路路图标按钮 + `onChatClick` prop + 监听处理状态动画 |
| `app/page.tsx` | 修改 | 传入 `onChatClick` |
| `features/recording/components/fab.tsx` | 修改 | WebSocket 事件同步到全局 store：`asr.done` → start, `process.result` → renew, `todo.created` → end, `error` → end |
| `features/recording/components/text-bottom-sheet.tsx` | 修改 | handleSubmit / handleImportUrl 接入全局 store |

## 不改动
- `/` 输入框快捷方式 — 保留
- FAB 处理胶囊（witty text）— 保留现有行为，它和路路图标各自独立
- Gateway WebSocket 事件 — `todo.created` 已存在，无需改后端
- `LuluLogo` 组件 — 已满足需求

## 边界条件
- [ ] 并发管道（用户连续发两条）— 引用计数，各自独立生命周期
- [ ] 纯记录型输入（不产生 todo）— 8s 衰减自动结束，不卡死
- [ ] 暗色模式 — LuluLogo 使用当前主题 variant
- [ ] Header 未挂载（覆盖层打开）— store 独立于 UI，恢复后自动读取当前状态
- [ ] Gateway 断连 — WebSocket 重连后管道 ID 已失效，靠衰减/绝对超时归零
