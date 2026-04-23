---
status: superseded
superseded_by: "chat-system.md"
id: "chat-greeting-and-input-fix"
domain: chat
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# 聊天模式优化：AI 问候 + 输入框浮动

> 状态：✅ 已完成

## 概述
优化从顶部路路图标进入聊天的体验：(1) AI 根据用户最近日记/待办/时间段生成个性化问候，替代旧的命令列表；(2) 聊天输入框改为真正固定浮动，不随消息内容滚动。

---

## Part A: AI 个性化问候

### 场景 A1: 早上进入聊天 — 引导规划
```
假设 (Given)  当前时间为 06:00–12:00（早上）
      并且    用户有最近 1 天内的日记记录
当   (When)   用户点击顶部路路图标进入聊天
那么 (Then)   AI 加载最近 1 天的日记摘要 + 未完成待办
      并且    AI 生成一段包含具体事务引用的早间问候
      并且    问候引导用户说出今天计划做什么
      并且    不再显示旧的"可用命令如下"命令列表
```

### 场景 A2: 下午/晚上进入聊天 — 引导复盘或问候
```
假设 (Given)  当前时间为 12:00–24:00（下午/晚上）
      并且    用户有当天的日记记录或已完成的待办
当   (When)   用户点击顶部路路图标进入聊天
那么 (Then)   AI 加载当天日记摘要 + 待办完成情况
      并且    AI 根据具体内容生成晚间问候
      并且    问候推测用户可能想复盘或总结今天的事
      并且    引用日记或待办中的具体事项（不泛泛而谈）
```

### 场景 A3: 无日记/待办时的 fallback 问候
```
假设 (Given)  用户最近 1 天没有任何日记记录和待办
当   (When)   用户点击顶部路路图标进入聊天
那么 (Then)   AI 生成一个基于时间段的简短温暖问候
      并且    不引用具体事务（因为没有数据）
      并且    引导用户随便聊聊或记录点什么
```

### 场景 A4: 从其他入口进入聊天 — 保持原行为
```
假设 (Given)  用户从文本输入框输入 "/" 进入命令模式
      或者    用户从侧边栏/FAB/日记等入口进入聊天
当   (When)   chat 打开时 initialMessage 不为空
那么 (Then)   保持原有行为不变（命令列表或直接对话）
```

### 场景 A5: 问候中的时间感知
```
假设 (Given)  当前时间为凌晨 00:00–06:00
当   (When)   用户进入聊天
那么 (Then)   AI 问候体现"夜深了"的关怀语气
      并且    不强行引导规划或复盘
```

---

## Part B: 聊天输入框浮动固定

### 场景 B1: 消息列表滚动时输入框保持固定
```
假设 (Given)  聊天中有较多消息（超过一屏）
当   (When)   用户向上滚动查看历史消息
那么 (Then)   输入框始终固定在屏幕底部
      并且    不随消息内容一起滚动
      并且    输入框上方有可见的分隔效果（阴影或边框）
```

### 场景 B2: 移动端键盘弹出时输入框跟随
```
假设 (Given)  用户在移动端（iOS/Android via Capacitor）
当   (When)   点击输入框弹出软键盘
那么 (Then)   输入框上移到键盘正上方
      并且    消息列表可见区域随之缩小但仍可滚动
```

### 场景 B3: 输入框多行展开不遮挡消息
```
假设 (Given)  用户在输入框中输入多行文本
当   (When)   输入框高度增长
那么 (Then)   消息列表底部相应上移，不被输入框遮挡
      并且    输入框最大高度不超过屏幕的 1/3
```

---

## 边界条件
- [ ] 网关未连接时：显示"连接中..."，连接成功后再发起问候
- [ ] 问候生成超时（>10s）：显示 fallback 静态问候
- [ ] 用户快速进出聊天：不产生多余请求
- [ ] Soul/Profile 为空（新用户）：问候仍正常，不报错
- [ ] 日记内容很长：截断到合理长度（复用 MAX_TRANSCRIPT_CHARS）

## 接口约定

### A: 问候流程（Gateway chat.start 变更）

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

### B: 输入框布局变更

```typescript
// chat-view.tsx 输入框从 flex shrink-0 改为 fixed bottom-0
// 消息列表增加底部 padding 避免被输入框遮挡
```

## 依赖
- `gateway/src/handlers/chat.ts` — 问候上下文注入
- `gateway/src/db/repositories/todo.ts` — todoRepo.findPendingByUser/Device
- `gateway/src/db/repositories/record.ts` — recordRepo.findByDeviceAndDateRange
- `features/chat/hooks/use-chat.ts` — 前端连接流程
- `features/chat/components/chat-view.tsx` — 输入框布局
- `app/page.tsx` — 路路图标入口参数

## 备注
- 问候 prompt 遵循 AGENTS.md 中的禁止开头语规则（不用"好的!"、"当然!"等）
- 问候应简短（2-4 句），引用具体事务，不泛泛而谈
- 问候 tier 用 "agent"（快速响应，不需要深度推理）
- 保留旧的 "/" 命令列表路径：从 text-bottom-sheet 输入 "/" 仍走命令模式
- Issue 3（soul/profile 更新检查）后续单独讨论
