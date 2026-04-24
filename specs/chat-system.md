---
id: "051"
title: "Chat System"
status: completed
domain: chat
risk: medium
dependencies: ["auth.md"]
superseded_by: null
created: 2026-03-23
updated: 2026-04-04
---

# Chat System

> 合并自: `chat-greeting-and-input-fix.md`, `chat-ui-redesign.md`, `header-ai-entry.md`

---

## 1. Header & Entry (顶部入口)

> 来源: header-ai-entry.md

### 概述

在 WorkspaceHeader 搜索图标左侧添加路路（鹿）图标作为 AI 聊天入口。路路图标同时作为**全局 AI 后台处理状态指示器**——只要后台有 AI 管道在运行（process → digest → todo 投影 → 待办创建），图标就持续动画，直到所有后台工作完成。

### 核心问题

用户提交内容后，后台 AI 管道是**多阶段异步**的：

```
用户提交 → process(清理) → process.result → digest(Strike分解) → todo-projector(待办投影) → todo.created
           ~2s               ↑ 前端目前在这里就结束了    ~6s                ~0.5s
                             但用户看不到待办出现
```

当前 FAB 在 `process.result` 就显示"处理完成"，但 digest + todo 投影还在跑。用户困惑：说了创建待办，显示完成了，但待办列表里没有。

**解法**：路路图标追踪整个管道生命周期——从用户提交开始，到最终的 `todo.created`（或管道静默结束）为止。

### 现状资源

- Gateway 已通过 WebSocket 发送 `todo.created` 事件（`index.ts:183-200`），前端 `input-bar.tsx:119` 已监听
- FAB 监听 `asr.done` / `process.result` / `error`，但**不监听 `todo.created`**
- `components/brand/lulu-logo.tsx` — 路路鹿 SVG 组件，支持 `size`、`variant`（light/dark/color）
- Header 当前布局：`[头像] [日记|待办] [🔍搜索] [🔔通知]`

### 场景

#### 场景 1-1: 路路图标作为 AI 聊天入口
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

#### 场景 1-2: 录音 → 全管道处理状态
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

#### 场景 1-3: 文本输入 → 全管道处理状态
```
假设 (Given)  用户通过输入框提交"帮我记一下明天开会"
当   (When)   createManualNote 请求发出
那么 (Then)   路路图标切换为处理中

当   (When)   HTTP 响应返回（record 创建成功，process 启动）
那么 (Then)   路路图标仍然保持处理中（后台 process + digest 在跑）

当   (When)   后台管道完成（todo.created 或无更多事件 + 超时归零）
那么 (Then)   路路图标恢复静态
```

#### 场景 1-4: 附件上传 / URL 导入
```
假设 (Given)  用户上传图片或导入 URL
当   (When)   请求发出
那么 (Then)   路路图标切换为处理中
并且 (And)    请求完成后（ingest API 返回），后台 digest 可能还在跑
并且 (And)    管道最终完成后恢复静态
```

#### 场景 1-5: 管道无产出的静默结束
```
假设 (Given)  用户输入"今天天气不错"（纯 feel/perceive，不会产生 todo）
当   (When)   process + digest 完成但没有 todo.created 事件
那么 (Then)   路路图标在安全超时（8 秒无新事件）后恢复静态
并且 (And)    不会永远卡在处理中
```

#### 场景 1-6: 绝对安全超时
```
假设 (Given)  路路图标处于处理中
当   (When)   已持续 30 秒无任何事件
那么 (Then)   强制恢复静态
```

### 接口约定 — 全局 AI 处理状态 Store

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

### 边界条件
- [ ] 并发管道（用户连续发两条）— 引用计数，各自独立生命周期
- [ ] 纯记录型输入（不产生 todo）— 8s 衰减自动结束，不卡死
- [ ] 暗色模式 — LuluLogo 使用当前主题 variant
- [ ] Header 未挂载（覆盖层打开）— store 独立于 UI，恢复后自动读取当前状态
- [ ] Gateway 断连 — WebSocket 重连后管道 ID 已失效，靠衰减/绝对超时归零

---

## 2. Greeting & Personalization (问候与个性化)

> 来源: chat-greeting-and-input-fix.md <!-- ✅ completed -->

### 概述
优化从顶部路路图标进入聊天的体验：AI 根据用户最近日记/待办/时间段生成个性化问候，替代旧的命令列表。

### 场景

#### 场景 2-1: 早上进入聊天 — 引导规划 <!-- ✅ completed -->
```
假设 (Given)  当前时间为 06:00-12:00（早上）
      并且    用户有最近 1 天内的日记记录
当   (When)   用户点击顶部路路图标进入聊天
那么 (Then)   AI 加载最近 1 天的日记摘要 + 未完成待办
      并且    AI 生成一段包含具体事务引用的早间问候
      并且    问候引导用户说出今天计划做什么
      并且    不再显示旧的"可用命令如下"命令列表
```

#### 场景 2-2: 下午/晚上进入聊天 — 引导复盘或问候 <!-- ✅ completed -->
```
假设 (Given)  当前时间为 12:00-24:00（下午/晚上）
      并且    用户有当天的日记记录或已完成的待办
当   (When)   用户点击顶部路路图标进入聊天
那么 (Then)   AI 加载当天日记摘要 + 待办完成情况
      并且    AI 根据具体内容生成晚间问候
      并且    问候推测用户可能想复盘或总结今天的事
      并且    引用日记或待办中的具体事项（不泛泛而谈）
```

#### 场景 2-3: 无日记/待办时的 fallback 问候 <!-- ✅ completed -->
```
假设 (Given)  用户最近 1 天没有任何日记记录和待办
当   (When)   用户点击顶部路路图标进入聊天
那么 (Then)   AI 生成一个基于时间段的简短温暖问候
      并且    不引用具体事务（因为没有数据）
      并且    引导用户随便聊聊或记录点什么
```

#### 场景 2-4: 从其他入口进入聊天 — 保持原行为 <!-- ✅ completed -->
```
假设 (Given)  用户从文本输入框输入 "/" 进入命令模式
      或者    用户从侧边栏/FAB/日记等入口进入聊天
当   (When)   chat 打开时 initialMessage 不为空
那么 (Then)   保持原有行为不变（命令列表或直接对话）
```

#### 场景 2-5: 问候中的时间感知 <!-- ✅ completed -->
```
假设 (Given)  当前时间为凌晨 00:00-06:00
当   (When)   用户进入聊天
那么 (Then)   AI 问候体现"夜深了"的关怀语气
      并且    不强行引导规划或复盘
```

### 接口约定 — 问候流程（Gateway chat.start 变更）

```typescript
// 前端调用变更：路路图标入口不再传 initialMessage
// app/page.tsx
onChatClick={() => handleOpenCommandChat()} // 无参数，不传 "/"

// use-chat.ts: command mode + 无 initialMessage → 走 gateway 流式问候
// （复用 line 280 的正常流式启动路径）

// gateway chat.ts: command mode 分支变更
// 当 initialMessage 为空或 "/" 时，注入问候上下文
interface GreetingContext {
  recentTranscripts: string;   // 最近 1 天日记摘要
  pendingTodos: string;        // 未完成待办列表
  currentHour: number;         // 当前小时（0-23）
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
}
```

### 边界条件
- [ ] 网关未连接时：显示"连接中..."，连接成功后再发起问候
- [ ] 问候生成超时（>10s）：显示 fallback 静态问候
- [ ] 用户快速进出聊天：不产生多余请求
- [ ] Soul/Profile 为空（新用户）：问候仍正常，不报错
- [ ] 日记内容很长：截断到合理长度（复用 MAX_TRANSCRIPT_CHARS）

### 备注
- 问候 prompt 遵循 AGENTS.md 中的禁止开头语规则（不用"好的!"、"当然!"等）
- 问候应简短（2-4 句），引用具体事务，不泛泛而谈
- 问候 tier 用 "agent"（快速响应，不需要深度推理）
- 保留旧的 "/" 命令列表路径：从 text-bottom-sheet 输入 "/" 仍走命令模式
- Issue 3（soul/profile 更新检查）后续单独讨论

---

## 3. Conversation UI (对话区界面)

> 来源: chat-ui-redesign.md <!-- ✅ completed -->

### 设计目标
打造"高端 AI 对话"质感，参考 iOS 原生对话设计语言，强调呼吸感、材质感、状态感知。

### Phase 1: 顶部 — 极简与状态感知

#### 场景 3-1: 标题精简 <!-- ✅ completed -->
```
Given 用户进入聊天界面
When  header 渲染
Then  大标题显示"路路"（纯文字，font-weight 600，17px）
And   去掉下方所有小字副标题（日期范围、"和路路对话"等）
And   header 不侵入系统状态栏（正确使用 safe-area-inset-top）
```

#### 场景 3-2: AI 在线状态灯 <!-- ✅ completed -->
```
Given 用户进入聊天界面
When  WebSocket 已连接（connected = true）
Then  标题"路路"右侧显示一个 6px 绿色圆点
And   圆点带有呼吸脉冲动画（opacity 0.4→1→0.4，周期 2s）
And   圆点带有同色 glow 阴影（box-shadow: 0 0 8px）

When  WebSocket 未连接（connected = false）
Then  圆点变为灰色（text-secondary），无动画
```

#### 场景 3-3: 返回按钮 <!-- ✅ completed -->
```
Given 用户在聊天界面
When  点击左上角返回箭头
Then  触发 onClose
And   返回按钮为 muted 色，hover 变亮
```

#### 场景 3-4: 状态栏不侵入（Android 全机型） <!-- ✅ completed -->
```
Given 用户在任何 Android 机型上打开聊天界面（含荣耀 Magic 7 全面屏模式）
When  ChatView 渲染
Then  header 内容不与系统状态栏重叠
And   使用 .pt-safe class 提供安全距离

技术说明:
  - Android 层: overlaysWebView=false, statusBarColor=#f8f5f0
  - CSS 层: .pt-safe = max(env(safe-area-inset-top, 0px), 24px)
  - env(safe-area-inset-top) 在 Android WebView 返回 0, fallback 24px 兜底
  - 如 24px 仍不足(某些机型状态栏 >24px), 需 Android 原生层补充 WindowInsetsCompat
```

### 接口约定 — Header

```tsx
// header 使用 .pt-safe 而非 inline env()，确保 24px fallback 生效
<header className="... pt-safe">
  <button>← 返回</button>
  <div className="flex items-center gap-2">
    <span className="title">路路</span>
    <span className="status-dot" />  {/* 呼吸灯 */}
  </div>
</header>
```

### Phase 2: 对话区 — 质感与呼吸感

#### 场景 3-5: AI 头像优化 <!-- ✅ completed -->
```
Given AI 消息气泡渲染
When  显示头像
Then  头像为 32x32px 圆形
And   背景使用品牌色渐变底板: linear-gradient(135deg, #3A2E28, #2A201A)
And   带阴影: box-shadow: 0 4px 10px rgba(0,0,0,0.5)
And   内容为 emoji（16px）
And   头像与气泡顶部对齐（mt-0.5 → align-start）
```

#### 场景 3-6: AI 气泡重塑 <!-- ✅ completed -->
```
Given AI 回复消息
When  渲染气泡
Then  内边距: padding 14px 18px
And   圆角采用非对称设计: border-radius 20px 20px 20px 4px
And   背景色: bg-surface-high（暗色模式下为深灰）
And   边框: 1px solid rgba(255,255,255,0.03)（极淡描边增加层次）
And   文字行高: leading-[1.6]（增加呼吸感）
And   文字颜色: 略低于纯白的高级灰（text-on-surface）
```

#### 场景 3-7: 用户气泡 <!-- ✅ completed -->
```
Given 用户发送的消息
When  渲染气泡
Then  圆角: border-radius 20px 20px 4px 20px（右下角收窄）
And   不显示头像（保持现有逻辑）
And   内边距同 AI 气泡: padding 14px 18px
And   行高: leading-[1.6]
```

#### 场景 3-8: 消息间距 <!-- ✅ completed -->
```
Given 多条消息
When  渲染列表
Then  消息之间间距: mb-6（24px），增加对话呼吸感
And   AI 头像与气泡间距: gap-3（12px）
```

#### 场景 3-9: Streaming 打字指示器 <!-- ✅ completed -->
```
Given AI 正在回复（streaming = true 且 content 为空）
When  渲染 loading 状态
Then  显示三个圆点弹跳动画（保持现有）
And   圆点在 AI 气泡样式内渲染（保持非对称圆角）
```

---

## 4. Input & Controls (输入与控制)

> 来源: chat-ui-redesign.md Phase 3 + chat-greeting-and-input-fix.md Part B <!-- ✅ completed -->

### 场景

#### 场景 4-1: 整体布局 <!-- ✅ completed -->
```
Given 聊天界面底部输入区
When  渲染
Then  结构为两部分（去掉左侧 N 按钮）:
      [中间: 输入框] [右侧: 语音/发送按钮]
And   背景使用毛玻璃: bg-surface/85 + backdrop-blur-[20px]
And   顶部描边: border-top 1px solid rgba(255,255,255,0.05)
And   padding: 12px 20px，底部加 safe-area
```

#### 场景 4-2: 输入框样式 <!-- ✅ completed -->
```
Given 输入框
When  渲染
Then  背景: bg-surface-lowest
And   圆角: rounded-full（完全胶囊形）
And   高度: 44px（min-height）
And   内边距: px-5 py-2.5
And   描边: border 1px solid rgba(255,255,255,0.08)
And   placeholder: "输入你的想法..." 颜色为 muted
And   多行时自动扩展（max-h-24）
```

#### 场景 4-3: 麦克风按钮（无文字输入时） <!-- ✅ completed -->

> 注意: 聊天内语音输入当前不可用（Web Speech API 在 Android WebView 中不工作）。
> 本场景仅做视觉样式重构，功能修复见 ROADMAP.md "录音功能" 章节。

```
Given 输入框为空（input.trim() === ""）且 hasSpeechAPI = true
When  显示右侧按钮
Then  显示麦克风图标按钮
And   按钮为 40x40px 圆形
And   背景: 品牌色半透明 bg-deer/15
And   图标颜色: text-deer
And   hover 时背景加深: bg-deer/30
```

#### 场景 4-4: 发送按钮（有文字输入时） <!-- ✅ completed -->
```
Given 输入框有文字（input.trim() !== ""）
When  显示右侧按钮
Then  麦克风替换为发送按钮
And   按钮背景: 品牌渐变 linear-gradient(135deg, #89502C, #C8845C)
And   图标: Send icon，白色
And   40x40px 圆形
```

#### 场景 4-5: Skill 快捷建议 <!-- ✅ completed -->
```
Given 用户输入 "/" 触发技能建议
When  显示 skill chips
Then  chips 显示在输入框上方（保持现有逻辑）
And   样式保持: rounded-full bg-deer/10 text-deer
```

#### 场景 4-6: 消息列表滚动时输入框保持固定 <!-- ✅ completed -->
```
假设 (Given)  聊天中有较多消息（超过一屏）
当   (When)   用户向上滚动查看历史消息
那么 (Then)   输入框始终固定在屏幕底部
      并且    不随消息内容一起滚动
      并且    输入框上方有可见的分隔效果（阴影或边框）
```

#### 场景 4-7: 输入框多行展开不遮挡消息 <!-- ✅ completed -->
```
假设 (Given)  用户在输入框中输入多行文本
当   (When)   输入框高度增长
那么 (Then)   消息列表底部相应上移，不被输入框遮挡
      并且    输入框最大高度不超过屏幕的 1/3
```

### 接口约定 — 输入框布局

```typescript
// chat-view.tsx 输入框从 flex shrink-0 改为 fixed bottom-0
// 消息列表增加底部 padding 避免被输入框遮挡
```

---

## 5. Scroll & Keyboard (滚动与键盘)

> 来源: chat-ui-redesign.md Phase 4 <!-- ✅ completed -->

### 场景

#### 场景 5-1: 进入聊天即锁定 body <!-- ✅ completed -->
```
Given 用户进入聊天界面
When  ChatView 挂载
Then  立即锁定 body 滚动:
      body.style.overflow = "hidden"
      body.style.position = "fixed"
      body.style.top/left/right 设置
And   退出时恢复 body 状态和滚动位置
```

#### 场景 5-2: 键盘弹出不推动页面 <!-- ✅ completed -->
```
Given 聊天界面已挂载且 body 已锁定
When  用户点击输入框，键盘弹出
Then  仅输入区域跟随 visualViewport 上移
And   消息区域自动 scroll 到底部
And   body 不发生任何位移
```

#### 场景 5-3: 全屏容器高度 <!-- ✅ completed -->
```
Given 聊天界面
When  渲染主容器
Then  容器高度 = visualViewport.height（通过 useKeyboardOffset）
And   header 使用 sticky（在容器内）而非 fixed（避免层叠冲突）
And   输入区 fixed 在底部，bottom = keyboardOffset
```

#### 场景 5-4: 移动端键盘弹出时输入框跟随 <!-- ✅ completed -->
```
假设 (Given)  用户在移动端（iOS/Android via Capacitor）
当   (When)   点击输入框弹出软键盘
那么 (Then)   输入框上移到键盘正上方
      并且    消息列表可见区域随之缩小但仍可滚动
```

### 边界条件（对话区 + 滚动 + 键盘）
1. 暗色/亮色模式: 所有颜色使用 CSS 变量，自动适配
2. 安全区域: header 顶部 + 输入区底部正确处理 safe-area-inset
3. 长消息: 气泡 max-width 85%，文字自动换行
4. 快速连续消息: 保持 auto-scroll 行为
5. SwipeBack: 保留右滑返回手势，不受布局重构影响

---

## Implementation Phases (实施阶段)

### 已完成

| 模块 | 状态 | 来源 Spec |
|------|------|-----------|
| AI 个性化问候（场景 2-1 ~ 2-5） | ✅ completed | chat-greeting-and-input-fix.md |
| 输入框浮动固定（场景 4-6 ~ 4-7） | ✅ completed | chat-greeting-and-input-fix.md |
| Chat UI 顶部重构（场景 3-1 ~ 3-4） | ✅ completed | chat-ui-redesign.md |
| 对话区质感（场景 3-5 ~ 3-9） | ✅ completed | chat-ui-redesign.md |
| 底部输入区重构（场景 4-1 ~ 4-5） | ✅ completed | chat-ui-redesign.md |
| 滚动锁定与键盘（场景 5-1 ~ 5-4） | ✅ completed | chat-ui-redesign.md |

### 待开发

| 模块 | 状态 | 来源 Spec |
|------|------|-----------|
| 路路图标入口（场景 1-1） | 🟡 待开发 | header-ai-entry.md |
| 全管道处理状态（场景 1-2 ~ 1-6） | 🟡 待开发 | header-ai-entry.md |

### 文件清单

| 文件 | 变更类型 | 涉及模块 |
|------|---------|---------|
| `shared/lib/ai-processing.ts` | **新建** | 1. Header & Entry |
| `features/workspace/components/workspace-header.tsx` | 修改 | 1. Header & Entry |
| `app/page.tsx` | 修改 | 1. Header & Entry, 2. Greeting |
| `features/recording/components/fab.tsx` | 修改 | 1. Header & Entry |
| `features/recording/components/text-bottom-sheet.tsx` | 修改 | 1. Header & Entry |
| `features/chat/components/chat-view.tsx` | 重构 | 3. Conversation UI, 4. Input, 5. Scroll |
| `features/chat/components/chat-bubble.tsx` | 重构 | 3. Conversation UI |
| `features/chat/hooks/use-chat.ts` | 修改 | 2. Greeting |
| `gateway/src/handlers/chat.ts` | 修改 | 2. Greeting |
| `gateway/src/db/repositories/todo.ts` | 依赖 | 2. Greeting |
| `gateway/src/db/repositories/record.ts` | 依赖 | 2. Greeting |

### 不改动
- `/` 输入框快捷方式 — 保留
- FAB 处理胶囊（witty text）— 保留现有行为，它和路路图标各自独立
- Gateway WebSocket 事件 — `todo.created` 已存在，无需改后端
- `LuluLogo` 组件 — 已满足需求
