---
id: "070"
title: "并发加固 — Semaphore 超时 + AI 调用优先级 + Retry-After"
status: completed
domain: infra
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-02
---
# 并发加固 — Semaphore 超时 + AI 调用优先级 + Retry-After

> 状态：✅ 已完成

## 概述
为 50 人公测加固后端并发能力：Semaphore 加超时防止请求无限挂起，AI 调用区分优先级（实时聊天 > 后台任务），429 响应返回 Retry-After header 让客户端合理重试。

## 场景

### 场景 1: Semaphore 超时 — 排队超时自动拒绝
```
假设 (Given)  LLM Semaphore 已满（5 个并发都在运行）
当   (When)   新请求排队等待超过 30 秒
那么 (Then)   自动抛出 SemaphoreTimeoutError
并且 (And)    不会无限挂起，释放排队位置
```

### 场景 2: Semaphore 超时 — 正常排队通过
```
假设 (Given)  LLM Semaphore 已满
当   (When)   新请求排队等待 5 秒后有空位释放
那么 (Then)   请求正常获得信号量并执行
并且 (And)    不触发超时
```

### 场景 3: 优先级 — 实时聊天优先于后台任务
```
假设 (Given)  LLM Semaphore 已满，队列中有 3 个后台任务在排队
当   (When)   用户发起实时聊天请求
那么 (Then)   聊天请求插入队列头部，优先获得下一个空位
并且 (And)    后台任务继续排队不被取消
```

### 场景 4: 优先级 — 同优先级保持 FIFO
```
假设 (Given)  队列中有 2 个普通优先级请求在排队
当   (When)   又来 1 个普通优先级请求
那么 (Then)   按 FIFO 顺序执行，新请求排在末尾
```

### 场景 5: Retry-After — 限流返回重试时间
```
假设 (Given)  某设备的令牌桶已耗尽
当   (When)   该设备再次发起 HTTP 请求
那么 (Then)   返回 429 状态码
并且 (And)    响应头包含 Retry-After（秒数，向上取整）
并且 (And)    响应体包含 { error: "rate_limited", retryAfter: <秒数> }
```

### 场景 6: Retry-After — WebSocket 限流通知
```
假设 (Given)  某设备的 WebSocket 令牌桶已耗尽
当   (When)   该设备再次发送 WebSocket 消息
那么 (Then)   返回 { type: "error", code: "rate_limited", retryAfter: <秒数> } 消息
并且 (And)    不断开连接
```

### 场景 7: 异常处理 — Semaphore 超时不影响正在运行的任务
```
假设 (Given)  5 个 AI 调用正在执行，3 个请求在排队
当   (When)   排队中的某个请求超时
那么 (Then)   仅该请求被拒绝
并且 (And)    正在运行的 5 个任务不受影响
并且 (And)    其余排队任务不受影响
```

## 边界条件
- [ ] Semaphore 超时值为 0 时应立即拒绝（tryAcquire 语义）
- [ ] 优先级相同时严格 FIFO
- [ ] 令牌桶刚好恢复 1 个 token 时 Retry-After 应为 0
- [ ] 并发超时 — 多个请求同时超时不会死锁
- [ ] Semaphore max=1 时优先级队列仍正常工作

## 接口约定

### Semaphore 改造
```typescript
// 优先级枚举
export enum Priority {
  HIGH = 0,   // 实时聊天、用户主动操作
  NORMAL = 1, // 后台 process、digest 等
}

// acquire 新签名
class Semaphore {
  acquire<T>(
    fn: () => Promise<T>,
    opts?: {
      timeout?: number;    // 毫秒，默认 30000
      priority?: Priority; // 默认 NORMAL
    }
  ): Promise<T>;
}

// 超时错误
class SemaphoreTimeoutError extends Error {
  constructor(waited: number, pending: number);
}
```

### Rate Limit 改造
```typescript
// 返回值从 boolean 改为对象
interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // 秒，仅 allowed=false 时有值
}

function checkRateLimit(deviceId: string, maxTokens?: number, refillRate?: number): RateLimitResult;
function checkWsRateLimit(deviceId: string): RateLimitResult;
```

## 调用方适配

| 调用方 | 优先级 | 超时 |
|--------|--------|------|
| `handlers/chat.ts` (实时聊天) | HIGH | 30s |
| `handlers/process.ts` (录音处理) | NORMAL | 60s |
| `handlers/digest.ts` (摘要) | NORMAL | 60s |
| `cognitive/*` (后台认知) | NORMAL | 120s |
| `handlers/onboarding.ts` | HIGH | 30s |

## 依赖
- `gateway/src/lib/semaphore.ts` — 核心改造
- `gateway/src/middleware/rate-limit.ts` — 返回值改造
- `gateway/src/ai/provider.ts` — 传递优先级参数
- `gateway/src/index.ts` — HTTP/WS 层适配新 RateLimitResult
- 所有 `llmSemaphore.acquire()` 调用方 — 传递 priority + timeout

## 备注
- Semaphore 内部用两个队列（high/normal）实现优先级，避免引入外部依赖
- 超时默认 30s，后台任务可传更长超时（如 120s），但不能无限
- Rate Limit 改造是非破坏性的：返回对象替代 boolean，调用方需适配
- 不引入 Redis 等新依赖，保持轻量
