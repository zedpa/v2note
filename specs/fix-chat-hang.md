---
id: "081"
title: "修复：Chat AI 回复无限加载"
status: completed
backport: chat-system.md
domain: chat
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-02
---
# 修复：Chat AI 回复无限加载

> 状态：✅ 已完成

## 概述
用户在 Chat 中发送消息后，AI 只显示 🦌 加载动画永远不回复。前端 25 秒超时机制未生效。
根因是 gateway 端 stream 迭代因异常/空响应导致 `chat.done` 永远不发送。

## 根因分析

### 错误日志
gateway 日志无报错（静默失败），AI 请求可能因 API Key 缺失/错误而挂起。

### 失败链路（从后往前）

**第 1 层：AI Provider 静默失败**
- gateway/src/ai/provider.ts:96-102
- `DASHSCOPE_API_KEY` 为空时仅打印 warn，但继续用空 key 创建 provider
- `streamText()` 调用时 API 返回错误或超时，async generator 挂起/空完成

**第 2 层：Stream 迭代无超时保护**
- gateway/src/index.ts:333-351
```typescript
case "chat.message": {
  const stream = await sendChatMessage(...);
  for await (const chunk of stream) { ... }  // 如果 stream 挂起，永远阻塞
  send(ws, { type: "chat.done", ... });      // 永远不执行
}
```
- 没有 try-catch，没有超时。stream 挂起 → `chat.done` 永不发送

**第 3 层：前端超时机制竞态**
- features/chat/hooks/use-chat.ts:64-88
- `armResponseTimeout(25000)` 在 `send()` 时启动
- 如果 `chat.done`（空内容）确实到达，line 123 `clearResponseTimeout()` 会取消超时
- 但 streaming 已设为 false 且 content 为空 → 用户看到空消息气泡

**第 4 层：chat.done 空内容未处理**
- use-chat.ts:123-129 只清理 streaming 状态
- 不检查最后一条 assistant 消息是否有内容
- 空回复 → 空气泡（无文字），用户困惑

### 同类问题扫描
gateway/src/index.ts 中所有 `for await` stream 迭代都缺少超时保护：
- Line 314: `chat.start` greeting stream — 同样模式
- Line 333: `chat.message` — 本次 bug
这两处如果 AI 服务异常，都会导致 WebSocket handler 永久阻塞。

## 场景

### 场景 1: 正常对话回复
```
假设 (Given)  用户已登录，AI 服务正常
当   (When)   用户发送"帮我整理今天的事情"
那么 (Then)   AI 流式返回回复内容，逐字显示
并且 (And)    回复完成后 streaming 状态关闭
```

### 场景 2: AI 服务超时
```
假设 (Given)  AI 服务响应慢（>30 秒）
当   (When)   用户发送消息
那么 (Then)   25 秒后前端显示兜底文本："抱歉，我现在有点忙，稍后再试"
并且 (And)    streaming 状态关闭，用户可以继续发送
```

### 场景 3: AI 服务不可用（API Key 缺失）
```
假设 (Given)  DASHSCOPE_API_KEY 未配置
当   (When)   用户发送消息
那么 (Then)   gateway 在 30 秒内发送 chat.error 或 chat.done（含错误文本）
并且 (And)    前端显示"AI 暂时不可用，请稍后再试"
并且 (And)    不会阻塞 WebSocket handler
```

### 场景 4: AI 返回空响应
```
假设 (Given)  AI 服务正常但返回 0 个 chunk
当   (When)   stream 迭代完成，fullText 为空
那么 (Then)   gateway 发送 chat.done，前端显示兜底文本
并且 (And)    不显示空气泡
```

### 场景 5: 用户快速关闭重开 Chat
```
假设 (Given)  上一个消息仍在 streaming
当   (When)   用户关闭 Chat 再打开
那么 (Then)   旧的 message handler 被清理
并且 (And)    新 Chat 不会收到旧消息的 chunk
```

## 边界条件
- [ ] AI stream 挂起超过 60 秒 → gateway 应强制超时
- [ ] AI 返回 0 chunks → 前端应显示兜底文本
- [ ] WebSocket 断连中 → 前端超时机制独立于 WS 状态
- [ ] 连续发 3 条消息 → 不应积压，每条独立超时
- [ ] AI 返回部分 chunks 后挂起 → 已有内容应保留，追加超时提示

## 修复方案

### Fix 1: Gateway — Stream 超时保护（关键）
```typescript
// gateway/src/index.ts chat.message handler
case "chat.message": {
  try {
    const stream = await sendChatMessage(...);
    let fullText = "";
    const timeout = AbortSignal.timeout(60000); // 60 秒硬超时
    for await (const chunk of stream) {
      if (timeout.aborted) break;
      fullText += chunk;
      send(ws, { type: "chat.chunk", payload: { text: chunk } });
    }
    if (!fullText) fullText = "抱歉，我没能想出回复。你可以换个方式问我。";
    send(ws, { type: "chat.done", payload: { full_text: fullText } });
  } catch (err: any) {
    send(ws, { type: "chat.done", payload: { full_text: "抱歉，出了点问题，请稍后再试。" } });
  }
}
```

### Fix 2: AI Provider — 空 Key 快速失败
```typescript
// gateway/src/ai/provider.ts
if (!apiKey) {
  console.error("[ai] DASHSCOPE_API_KEY is not set — AI will not work");
  // 在 chatCompletionStream 中检查并快速 yield 错误消息
}
```

### Fix 3: 前端 — chat.done 空内容兜底
```typescript
// features/chat/hooks/use-chat.ts handleGatewayMessage
case "chat.done": {
  clearResponseTimeout();
  setStreaming(false);
  // 检查最后一条 assistant 消息是否为空
  setMessages((prev) => {
    const last = prev[prev.length - 1];
    if (last?.role === "assistant" && !last.content) {
      return [...prev.slice(0, -1), { ...last, content: "抱歉，我没能回复你。请稍后再试。" }];
    }
    return prev.filter((m) => m.role !== "tool-status");
  });
}
```

## 影响范围
- gateway/src/index.ts — chat.start + chat.message 的 stream 迭代（2 处）
- gateway/src/ai/provider.ts — API key 校验
- features/chat/hooks/use-chat.ts — chat.done 空内容处理
- 同样的 stream 超时保护应用于 gateway 中所有 for-await-of AI stream

## 决策：修 vs 重构
**修**。核心 stream 架构合理（WebSocket + async generator），问题在于缺少防御性编程。
添加超时保护和空响应兜底即可，不需要重构消息流。
