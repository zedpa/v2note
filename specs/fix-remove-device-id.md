---
id: fix-remove-device-id
title: "Fix: 全面清除 deviceId 概念，统一使用 userId"
status: completed
backport: auth-ux-login.md
domain: infra
risk: high
dependencies: []
created: 2026-04-12
updated: 2026-04-12
---

# Fix: 全面清除 deviceId 概念，统一使用 userId

## 概述

deviceId 是早期没有用户系统时引入的设备标识，用于在无登录状态下关联数据。
现在所有用户必须登录（有 userId），deviceId 已完成历史使命。
全面清理 deviceId 的引用，Session/WS/Handler 全部改用 userId。

## 背景

- Migration 044 已将所有表的唯一约束从 device_id 迁移到 user_id
- 所有 WS 操作都要求先 auth（有 userId 门控）
- deviceId 目前只是 JWT 中的冗余字段和 Session key 的历史遗留

## 清理范围

### 1. JWT Token 层

- `gateway/src/auth/jwt.ts`: AccessTokenPayload 移除 deviceId，只保留 userId
- `gateway/src/auth/middleware.ts`: AuthPayload 移除 deviceId

### 2. Session 管理层

- `gateway/src/session/manager.ts`: Session key 从 deviceId 改为 userId
  - `getSession(deviceId)` → `getSession(userId)`
  - Session.deviceId 字段删除
  - 所有调用方同步修改

### 3. WebSocket 层（gateway/src/index.ts）

- GatewayMessage payload 中的 deviceId 全部移除
- `connectionDeviceMap` 删除，只保留 `connectionUserMap`
- `deviceToWsMap` 改为 `userToWsMap`（userId → ws）
- `sendToDevice()` 改为 `sendToUser()`
- auth 消息只需 token（token 里有 userId）
- WS 速率限制改用 userId

### 4. Handler 层

所有 handler 中的 deviceId 参数/引用替换为 userId：
- `chat.ts`: initChat/sendChatMessage 参数
- `digest.ts`: processEntry context
- `asr.ts`: ASR session 和音频路由
- `process.ts`: ProcessPayload
- `daily-loop.ts`: dailyCycle 参数
- `command-full-mode.ts`: 命令处理
- `voice-action.ts`: 语音动作
- `report.ts`: 报告生成
- `onboarding.ts`: 引导流程
- `reflect.ts`: 反思引导
- `todo.ts`: 待办操作
- `chat-daily-diary.ts`: 日常日记

### 5. ASR 会话管理

- `gateway/src/handlers/asr.ts`: asrSessions key 从 deviceId 改为 userId
- `sendAudioChunk(deviceId, ...)` → `sendAudioChunk(userId, ...)`
- `getVocabularyIdForDevice()` → `getVocabularyIdForUser()`
- startASR 时先 cancel 该 userId 已有的 ASR session（防止多设备并发覆盖导致资源泄漏）

### 6. 前端

- `shared/lib/device.ts`: 整个文件删除（或保留为纯平台检测工具）
- `shared/lib/api/device.ts`: 设备注册/查找 API 删除
- `shared/lib/api/auth.ts`: login/register 参数移除 deviceId
- `shared/lib/api/index.ts`: 移除 X-Device-Id header、setApiDeviceId
- `shared/lib/types.ts`: 移除所有接口中的 device_id 字段
- 前端 WS 消息不再发送 deviceId
- `features/chat/lib/gateway-client.ts`: WS 消息移除 deviceId

### 7. Gateway Auth 路由

- `gateway/src/routes/auth.ts`: login/register 不再需要 deviceId 参数
- `gateway/src/auth/link-device.ts`: linkDeviceToUser 改为 no-op（保留签名）
- `gateway/src/routes/devices.ts`: 保留但标记为可选/遗留

### 8. DB Repository 层

- 所有 repo 中 device_id 参数/查询移除
- `gateway/src/db/repositories/device.ts`: 保留（device 表仍存在于 DB）

### 9. Proactive Engine

- `gateway/src/proactive/engine.ts`: registerDevice 改为 registerUser

### 10. 类型定义

- `shared/lib/types.ts`: AuthIdentity 移除 deviceId，Goal/Review/PendingIntent/MemoryEntry/Soul 移除 device_id
- 前端 todo-types 等已在之前清理过

## 多设备策略

**设计决策：单用户单活跃连接，最新连接覆盖旧连接。**

理由：当前产品是个人认知工具，不存在协作场景。多设备同时使用是极端边缘场景。

具体处理：
1. **WS 连接**：`userToWsMap: Map<string, WebSocket>`，新连接覆盖旧连接
2. **ASR session**：新设备 startASR 时，先 cancel 已有 ASR session（清理 Python 进程 + 音频资源），再创建新 session
3. **Proactive 推送**：只推最新活跃连接（这是有意设计）
4. **Chat 流式回复**：通过 userToWsMap 发送，切换设备后回复自动到新设备

### JWT 向后兼容

已发行的旧 token（含 deviceId 字段）仍能正常解析：
- `jwt.verify` 返回完整 payload，类型断言只取 userId（deviceId 被忽略，无害）
- 不需要强制用户重新登录

## 不动的部分（保留）

1. **device 表**：数据库中的 device 表保留，不做 DROP（避免数据丢失）
2. **device_id 列**：各表中的 device_id 列保留为 nullable 历史字段，不删列
3. **设备注册路由**：`/api/v1/devices/register` 保留但变为可选

## 场景

### S1: 用户登录后 WebSocket 连接

```
假设 (Given)  用户已登录，有有效的 accessToken
当   (When)   前端建立 WebSocket 并发送 auth 消息
那么 (Then)   只需发送 { type: "auth", payload: { token } }
并且 (And)    服务端从 token 解析出 userId，建立 userId → ws 映射
```

### S2: 聊天消息路由

```
假设 (Given)  WebSocket 已认证
当   (When)   用户发送 chat.message
那么 (Then)   消息中不含 deviceId
并且 (And)    服务端从 connectionUserMap 获取 userId 路由消息
```

### S3: ASR 音频流

```
假设 (Given)  WebSocket 已认证
当   (When)   用户发送 asr.start
那么 (Then)   ASR session 以 userId 为 key
并且 (And)    音频二进制帧通过 connectionUserMap 路由
```

### S4: 多设备 ASR 并发

```
假设 (Given)  用户在设备 A 正在录音（ASR session 存在）
当   (When)   用户在设备 B 连接并发起新的 asr.start
那么 (Then)   设备 A 的 ASR session 被 cancel（Python 进程关闭、音频资源清理）
并且 (And)    设备 B 的 ASR session 正常创建
```

### S5: 旧 Token 兼容

```
假设 (Given)  用户持有旧版 JWT（payload 含 deviceId + userId）
当   (When)   用户用旧 token 连接 WebSocket
那么 (Then)   auth 正常通过，userId 正确提取
并且 (And)    deviceId 字段被忽略，不影响功能
```

### S6: 断连重连

```
假设 (Given)  用户之前有活跃的 chat session
当   (When)   WebSocket 断连后重连并重新 auth
那么 (Then)   userToWsMap 更新为新连接
并且 (And)    chat session 通过 userId 恢复
```

## 验收行为（E2E 锚点）

### 行为 1: 登录后进入主页
用户登录后进入主页，无报错

### 行为 2: 聊天收到回复
用户打开聊天发送消息，收到 AI 回复

### 行为 3: 语音识别
用户使用语音录入，语音识别正常工作

### 行为 4: 待办操作
用户创建/完成待办，操作成功

### 行为 5: 断网恢复
断网重连后聊天功能正常恢复

## 边界条件

- [ ] 多设备同时在线（同一 userId 两个 WS）→ 最后一个连接覆盖
- [ ] Token 过期后重连 → 正常刷新 token 流程
- [ ] 未登录状态 → 所有 WS 操作被拒绝（已有门控）
