---
status: superseded
superseded_by: "chat-system.md"
id: "chat-ui-redesign"
domain: chat
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# Chat UI 大师级重构

> 状态: ✅ completed
> 优先级: P1
> 影响范围: `features/chat/components/chat-view.tsx`, `features/chat/components/chat-bubble.tsx`

## 背景

当前聊天界面存在以下问题：
- 顶部侵入状态栏
- 键盘弹出时整个页面被推动
- 视觉质感不够精致（头像、气泡、输入区缺乏层次感）
- 底部输入区结构混乱（N 按钮无意义、麦克风不突出）

## 设计目标

打造"高端 AI 对话"质感，参考 iOS 原生对话设计语言，强调呼吸感、材质感、状态感知。

---

## Phase 1: 顶部 — 极简与状态感知

### 场景 S1-1: 标题精简

```
Given 用户进入聊天界面
When  header 渲染
Then  大标题显示"路路"（纯文字，font-weight 600，17px）
And   去掉下方所有小字副标题（日期范围、"和路路对话"等）
And   header 不侵入系统状态栏（正确使用 safe-area-inset-top）
```

### 场景 S1-2: AI 在线状态灯

```
Given 用户进入聊天界面
When  WebSocket 已连接（connected = true）
Then  标题"路路"右侧显示一个 6px 绿色圆点
And   圆点带有呼吸脉冲动画（opacity 0.4→1→0.4，周期 2s）
And   圆点带有同色 glow 阴影（box-shadow: 0 0 8px）

When  WebSocket 未连接（connected = false）
Then  圆点变为灰色（text-secondary），无动画
```

### 场景 S1-3: 返回按钮

```
Given 用户在聊天界面
When  点击左上角返回箭头
Then  触发 onClose
And   返回按钮为 muted 色，hover 变亮
```

### 场景 S1-4: 状态栏不侵入（Android 全机型）

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

---

## Phase 2: 对话区 — 质感与呼吸感

### 场景 S2-1: AI 头像优化

```
Given AI 消息气泡渲染
When  显示头像
Then  头像为 32×32px 圆形
And   背景使用品牌色渐变底板: linear-gradient(135deg, #3A2E28, #2A201A)
And   带阴影: box-shadow: 0 4px 10px rgba(0,0,0,0.5)
And   内容为 🦌 emoji（16px）
And   头像与气泡顶部对齐（mt-0.5 → align-start）
```

### 场景 S2-2: AI 气泡重塑

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

### 场景 S2-3: 用户气泡

```
Given 用户发送的消息
When  渲染气泡
Then  圆角: border-radius 20px 20px 4px 20px（右下角收窄）
And   不显示头像（保持现有逻辑）
And   内边距同 AI 气泡: padding 14px 18px
And   行高: leading-[1.6]
```

### 场景 S2-4: 消息间距

```
Given 多条消息
When  渲染列表
Then  消息之间间距: mb-6（24px），增加对话呼吸感
And   AI 头像与气泡间距: gap-3（12px）
```

### 场景 S2-5: Streaming 打字指示器

```
Given AI 正在回复（streaming = true 且 content 为空）
When  渲染 loading 状态
Then  显示三个圆点弹跳动画（保持现有）
And   圆点在 AI 气泡样式内渲染（保持非对称圆角）
```

---

## Phase 3: 底部输入区 — 控制中心重构

### 场景 S3-1: 整体布局

```
Given 聊天界面底部输入区
When  渲染
Then  结构为两部分（去掉左侧 N 按钮）:
      [中间: 输入框] [右侧: 语音/发送按钮]
And   背景使用毛玻璃: bg-surface/85 + backdrop-blur-[20px]
And   顶部描边: border-top 1px solid rgba(255,255,255,0.05)
And   padding: 12px 20px，底部加 safe-area
```

### 场景 S3-2: 输入框样式

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

### 场景 S3-3: 麦克风按钮（无文字输入时）

> ⚠️ 注意: 聊天内语音输入当前不可用（Web Speech API 在 Android WebView 中不工作）。
> 本场景仅做视觉样式重构，功能修复见 ROADMAP.md "录音功能" 章节。

```
Given 输入框为空（input.trim() === ""）且 hasSpeechAPI = true
When  显示右侧按钮
Then  显示麦克风图标按钮
And   按钮为 40×40px 圆形
And   背景: 品牌色半透明 bg-deer/15
And   图标颜色: text-deer
And   hover 时背景加深: bg-deer/30
```

### 场景 S3-4: 发送按钮（有文字输入时）

```
Given 输入框有文字（input.trim() !== ""）
When  显示右侧按钮
Then  麦克风替换为发送按钮
And   按钮背景: 品牌渐变 linear-gradient(135deg, #89502C, #C8845C)
And   图标: Send icon，白色
And   40×40px 圆形
```

### 场景 S3-5: Skill 快捷建议

```
Given 用户输入 "/" 触发技能建议
When  显示 skill chips
Then  chips 显示在输入框上方（保持现有逻辑）
And   样式保持: rounded-full bg-deer/10 text-deer
```

---

## Phase 4: 滚动锁定与布局稳定

### 场景 S4-1: 进入聊天即锁定 body

```
Given 用户进入聊天界面
When  ChatView 挂载
Then  立即锁定 body 滚动:
      body.style.overflow = "hidden"
      body.style.position = "fixed"
      body.style.top/left/right 设置
And   退出时恢复 body 状态和滚动位置
```

### 场景 S4-2: 键盘弹出不推动页面

```
Given 聊天界面已挂载且 body 已锁定
When  用户点击输入框，键盘弹出
Then  仅输入区域跟随 visualViewport 上移
And   消息区域自动 scroll 到底部
And   body 不发生任何位移
```

### 场景 S4-3: 全屏容器高度

```
Given 聊天界面
When  渲染主容器
Then  容器高度 = visualViewport.height（通过 useKeyboardOffset）
And   header 使用 sticky（在容器内）而非 fixed（避免层叠冲突）
And   输入区 fixed 在底部，bottom = keyboardOffset
```

---

## 边界条件

1. 暗色/亮色模式: 所有颜色使用 CSS 变量，自动适配
2. 安全区域: header 顶部 + 输入区底部正确处理 safe-area-inset
3. 长消息: 气泡 max-width 85%，文字自动换行
4. 快速连续消息: 保持 auto-scroll 行为
5. SwipeBack: 保留右滑返回手势，不受布局重构影响

---

## 文件清单

| 文件 | 变更类型 |
|------|---------|
| `features/chat/components/chat-view.tsx` | 重构 header + 输入区 + body 锁定 |
| `features/chat/components/chat-bubble.tsx` | 重构头像 + 气泡样式 |

## 验收标准

- [ ] header 不侵入状态栏，标题精简为"路路" + 呼吸灯
- [ ] AI 头像有品牌色圆形底板
- [ ] 气泡非对称圆角 + 宽松内边距 + 1.6 行高
- [ ] 底部无 N 按钮，输入框胶囊形，麦克风按钮突出
- [ ] 毛玻璃底部输入区
- [ ] 进入即锁定 body，键盘弹出不推动页面
- [ ] 暗色/亮色模式均正常
