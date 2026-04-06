---
id: "112"
title: "Recording Resilience — 录音防丢 + 断线重试"
status: active
domain: voice
dependencies: ["voice-routing.md"]
superseded_by: null
created: 2026-04-04
updated: 2026-04-04
---

# Recording Resilience — 录音防丢 + 断线重试

> 优先级：P0 | 用户反馈录音丢失

## 概述

用户反馈：录音过程中因网络波动或 gateway 未连接导致录音数据丢失。当前 `sendBinary()` 在 WS 未 OPEN 时直接丢弃 PCM 块，无任何缓存或重试。本 spec 分两部分：
1. **本地音频缓存 + 失败重试**：录音始终保存本地副本，失败时创建"待重试"日记条目
2. **连接保护加固**：修复 sendBinary 无队列、input-bar 无连接检查、超时硬编码三个漏洞

---

## Part 1: 本地音频缓存 + 失败重试

### 1.1 录音本地缓存

#### 场景 1.1.1: 录音时同时累积完整 PCM buffer
```
假设 (Given)  用户开始录音（FAB 或 input-bar）
当   (When)   每个 PCM chunk 通过 onPCMData 回调产生
那么 (Then)   chunk 同时做两件事：
              1. 发送给 gateway（已有逻辑）
              2. 追加到 fullBufferRef: ArrayBuffer[] 内存数组
并且 (And)    录音结束时，fullBufferRef 包含完整音频数据
```

#### 场景 1.1.2: 录音结束后存入 IndexedDB
```
假设 (Given)  用户松手/上滑结束录音
当   (When)   finishRecording() 被调用
那么 (Then)   将 fullBufferRef 合并为单个 ArrayBuffer
并且 (And)    写入 IndexedDB（表名 pending_audio），schema：
              {
                id: string,          // 自动生成 UUID
                pcmData: ArrayBuffer, // 完整 PCM 音频
                duration: number,     // 秒数
                sourceContext: string, // "todo" | "timeline" | "chat" | "review"
                forceCommand: boolean,
                notebook: string | null,
                createdAt: string,    // ISO timestamp
                status: "pending",   // "pending" | "completed"
              }
并且 (And)    写入后清空 fullBufferRef
```

#### 场景 1.1.3: 处理成功后标记本地缓存（不自动删除）
```
假设 (Given)  录音已缓存到 IndexedDB（status="pending"）
当   (When)   前端收到 process.result（正常处理完成）
那么 (Then)   根据 recordId 找到对应缓存条目
并且 (And)    标记 status="completed"（保留本地副本，由用户自行决定是否删除）
```

#### 场景 1.1.4: 取消录音不缓存
```
假设 (Given)  用户左滑取消录音
当   (When)   cancelRecording() 被调用
那么 (Then)   清空 fullBufferRef，不写入 IndexedDB
```

### 1.2 失败检测

#### 场景 1.2.1: WS 断开导致录音失败
```
假设 (Given)  录音过程中 WS 连接断开
当   (When)   finishRecording() 调用时 client.connected === false
那么 (Then)   不发送 asr.stop（发了也没用）
并且 (And)    标记此录音为"失败"
并且 (And)    触发失败处理流程（→ 场景 1.3.1）
```

#### 场景 1.2.2: asr.done 超时
```
假设 (Given)  录音结束后已发送 asr.stop
当   (When)   15 秒内未收到 asr.done 也未收到 asr.error
那么 (Then)   判定为超时失败
并且 (And)    触发失败处理流程（→ 场景 1.3.1）
```

#### 场景 1.2.3: asr.error 响应
```
假设 (Given)  录音结束后已发送 asr.stop
当   (When)   收到 asr.error 消息
那么 (Then)   触发失败处理流程（→ 场景 1.3.1）
并且 (And)    保留 error message 供 UI 展示
```

### 1.3 失败处理：创建本地"待重试"日记

#### 场景 1.3.1: 失败时前端创建占位 record
```
假设 (Given)  录音失败（1.2.1 / 1.2.2 / 1.2.3 任一触发）
当   (When)   IndexedDB 中有该录音的完整 PCM 数据
那么 (Then)   前端调用 POST /api/v1/records 创建占位 record：
              {
                status: "pending_retry",
                source: "voice",
                duration_seconds: 录音时长,
                notebook: 当前 notebook
              }
并且 (And)    将 record.id 写回 IndexedDB 条目的 recordId 字段
并且 (And)    触发 recording:uploaded 事件，时间线刷新显示此条目
并且 (And)    fabNotify.warn("录音已保存，网络恢复后可重试")
```

> **注意**：如果连接完全断开导致 POST 也失败，则仅保留 IndexedDB 本地缓存，
> 下次 App 启动时检查并创建占位 record（场景 1.4.2）。

#### 场景 1.3.2: 时间线展示"待重试"条目
```
假设 (Given)  时间线查询返回 status="pending_retry" 的 record
当   (When)   渲染该条目
那么 (Then)   显示样式：
              ┌─────────────────────────────────┐
              │ ⚠️ 录音未处理          [重试]   │
              │ ▶ ───────────── 0:23            │
              │ 4月4日 14:32                    │
              └─────────────────────────────────┘
并且 (And)    播放条使用本地 IndexedDB 中的 PCM 数据（非 OSS URL）
并且 (And)    点击 [重试] → 触发重试流程（场景 1.4.1）
```

### 1.4 重试机制

#### 场景 1.4.1: 用户手动点击重试
```
假设 (Given)  时间线上有"待重试"条目，用户点击 [重试]
当   (When)   gateway 已连接
那么 (Then)   从 IndexedDB 读取 PCM 数据
并且 (And)    将 PCM 转为 WAV（添加 44 字节 header）
并且 (And)    通过新增 HTTP 端点上传：
              POST /api/v1/records/:id/retry-audio
              Content-Type: application/octet-stream
              Body: WAV 二进制数据
并且 (And)    gateway 端：
              1. 存 PCM 到临时文件
              2. 调用 Python ASR 转写（upload 模式）
              3. 创建 transcript
              4. 更新 record status → "processing"
              5. 上传 OSS，更新 audio_path
              6. 触发 processEntry()
              7. 发送 process.result WS 消息
并且 (And)    前端收到 process.result 后，标记 IndexedDB 缓存 status="completed"（不自动删除）
并且 (And)    时间线条目刷新为正常日记
```

#### 场景 1.4.2: App 启动时自动检查
```
假设 (Given)  App 启动（或从后台恢复）
当   (When)   IndexedDB 中有 status="pending" 的缓存条目
那么 (Then)   检查每条的 recordId：
              - 有 recordId → 已创建过占位 record，无需再创建
              - 无 recordId → 尝试创建占位 record（场景 1.3.1）
并且 (And)    如果有待重试条目，在 FAB 上显示小红点提示
```

#### 场景 1.4.3: 重试失败
```
假设 (Given)  用户点击重试但网络仍不可用
当   (When)   HTTP 请求失败
那么 (Then)   fabNotify.error("重试失败，请检查网络")
并且 (And)    条目保持"待重试"状态不变
并且 (And)    不删除 IndexedDB 缓存
```

### 1.5 本地录音管理（用户控制）

> 复用日记条目展开后的三点菜单（notes-timeline.tsx:600-640，已有编辑/复制/删除）

#### 场景 1.5.1: 三点菜单显示"删除本地录音"选项
```
假设 (Given)  日记条目展开，用户点击三点菜单（MoreVertical）
当   (When)   该 record 在 IndexedDB 中有对应的本地缓存
那么 (Then)   菜单中在"删除"上方新增一项：
              🗑 删除本地录音
              （与"删除"区分：删除 = 删除整条日记，删除本地录音 = 仅删本地音频缓存）
```

#### 场景 1.5.2: 已处理日记 — 删除本地缓存
```
假设 (Given)  record 已成功处理（status="completed"），但本地仍有缓存
当   (When)   用户点击"删除本地录音"
那么 (Then)   删除 IndexedDB 中对应的缓存条目
并且 (And)    record 保留不变（OSS 音频仍可播放）
并且 (And)    fabNotify.info("本地录音已清除")
```

#### 场景 1.5.3: 待重试日记 — 删除确认
```
假设 (Given)  record 状态为 pending_retry（尚未处理）
当   (When)   用户点击"删除本地录音"
那么 (Then)   弹出确认："该录音尚未处理，删除后无法恢复，确定？"
并且 (And)    确认后：删除 IndexedDB 缓存 + 删除占位 record
并且 (And)    时间线刷新，该条目消失
```

#### 场景 1.5.4: 存储空间不足时提醒（不强制删除）
```
假设 (Given)  IndexedDB 中缓存总大小超过 50MB
当   (When)   新录音尝试缓存
那么 (Then)   仍然正常缓存（不拒绝）
并且 (And)    fabNotify.warn("本地录音缓存较多，可在日记菜单中清理")
并且 (And)    不自动删除任何历史缓存
```

---

## Part 2: 连接保护加固

### 2.1 sendBinary 加缓冲队列

#### 场景 2.1.1: WS 未 OPEN 时缓存二进制数据
```
假设 (Given)  录音正在进行中
当   (When)   sendBinary() 被调用且 ws.readyState !== OPEN
那么 (Then)   将 ArrayBuffer 追加到 pendingBinaryData: ArrayBuffer[] 队列
并且 (And)    队列上限 300 块（约 30 秒 16kHz PCM @ 100ms/块）
并且 (And)    超过上限时丢弃最早的块（FIFO）
并且 (And)    console.warn("[gateway-client] Binary queued, WS not open")
```

#### 场景 2.1.2: WS 重新连接后冲刷二进制队列
```
假设 (Given)  pendingBinaryData 中有缓存的二进制块
当   (When)   WS 重新连接成功（onopen 触发）
那么 (Then)   在发送 pendingMessages（JSON 队列）之后
并且 (And)    依次发送 pendingBinaryData 中的所有块
并且 (And)    清空 pendingBinaryData
```

#### 场景 2.1.3: 断开连接时清空队列
```
假设 (Given)  调用 disconnect()（主动断开）
当   (When)   清理资源
那么 (Then)   同时清空 pendingBinaryData
```

### 2.2 input-bar 连接保护

#### 场景 2.2.1: input-bar 录音前等待连接
```
假设 (Given)  用户在 input-bar 长按触发录音
当   (When)   getGatewayClient() 获取客户端
那么 (Then)   与 FAB 相同逻辑：
              if (!client.connected) {
                client.connect();
                const ready = await client.waitForReady();
                if (!ready) {
                  fabNotify.error("无法连接服务器，请检查网络");
                  return;
                }
              }
并且 (And)    只有连接成功后才发送 asr.start 和开始录音
```

### 2.3 连接超时可配置

#### 场景 2.3.1: waitForReady 超时改为可配置
```
假设 (Given)  当前 waitForReady 硬编码 5000ms
当   (When)   重构 waitForReady
那么 (Then)   默认超时改为 8000ms（兼顾弱网）
并且 (And)    支持参数覆盖：waitForReady(timeoutMs?: number)
并且 (And)    首次连接使用 8000ms，重连使用 5000ms
```

---

## 接口约定

### IndexedDB Schema

```typescript
// features/recording/lib/audio-cache.ts

interface PendingAudio {
  id: string;                // crypto.randomUUID()
  recordId?: string;         // 后端 record ID（占位创建后回写）
  pcmData: ArrayBuffer;      // 完整 PCM 音频（16kHz 16-bit mono）
  duration: number;          // 秒数
  sourceContext: "todo" | "timeline" | "chat" | "review";
  forceCommand: boolean;
  notebook: string | null;
  createdAt: string;         // ISO 8601
  status: "pending" | "completed";
  lastError?: string;
}

// DB name: "v2note-audio-cache", store: "pending_audio"
```

### 新增 HTTP 端点

```typescript
// POST /api/v1/records/:id/retry-audio
// Content-Type: application/octet-stream
// Body: WAV binary (44-byte header + PCM data)
//
// 处理流程：
// 1. 验证 record 存在且 status === "pending_retry"
// 2. 保存 WAV 到临时文件
// 3. spawn Python ASR 转写
// 4. 创建 transcript
// 5. 上传 OSS
// 6. 触发 processEntry()
// 7. 返回 { recordId, transcript }
//
// 错误码：
// 404 — record 不存在
// 409 — record 已处理（status !== "pending_retry"）
// 500 — 转写/处理失败

interface RetryAudioResponse {
  recordId: string;
  transcript: string;
}
```

### Record status 扩展

```typescript
// 现有: "processing" | "completed" | "error"
// 新增: "pending_retry" | "expired"
```

---

## 边界条件

- [x] 录音 < 1 秒 → 不缓存（太短无价值），直接丢弃 — fab.tsx finishRecording
- [x] IndexedDB 不可用（隐私模式/旧浏览器）→ 降级：不缓存，行为同当前 — try/catch 包裹
- [x] 录音过程中 App 被杀 → 已累积的 fullBufferRef 丢失（内存），无法恢复。这是不可避免的
- [x] 占位 record 创建后，用户在时间线删除该 record → 同时清理 IndexedDB 缓存 — handleDeleteLocalAudio
- [x] 用户删除本地录音但 record 已处理成功 → 仅删缓存，record 和 OSS 音频不受影响 — handleDeleteLocalAudio
- [ ] 多条待重试录音 → 逐条重试，不并发（避免带宽争抢）
- [x] PCM 转 WAV header：sampleRate=16000, channels=1, bitsPerSample=16 — addWavHeader

---

## 关键文件变更

| 文件 | 变更 |
|------|------|
| **Part 1: 本地缓存** | |
| `features/recording/lib/audio-cache.ts` | **新建** — IndexedDB 封装（open/save/get/delete/cleanup） |
| `features/recording/components/fab.tsx` | fullBufferRef 累积；finishRecording 后存缓存；失败时创建占位 record |
| `features/notes/components/notes-timeline.tsx` | pending_retry 状态样式 + [重试] 按钮；三点菜单增加"删除本地录音" |
| `features/notes/components/mini-audio-player.tsx` | 支持从 ArrayBuffer 播放（非 OSS URL） |
| `gateway/src/routes/records.ts` | 新增 POST /:id/retry-audio 端点 |
| `gateway/src/handlers/asr.ts` | 提取 transcribeAndProcess 公共函数供 retry 端点复用 |
| **Part 2: 连接保护** | |
| `features/chat/lib/gateway-client.ts` | sendBinary 加队列；pendingBinaryData；waitForReady 超时改 8s |
| `features/recording/components/input-bar.tsx` | 录音前 waitForReady 检查 |

---

## 实施顺序

| Phase | 内容 | 复杂度 | 依赖 |
|-------|------|--------|------|
| **1** | Part 2: sendBinary 队列 + input-bar 保护 + 超时 | 低 | 无 |
| **2** | audio-cache.ts IndexedDB 封装 | 低 | 无 |
| **3** | fab.tsx 累积 buffer + 存缓存 + 失败检测 | 中 | Phase 2 |
| **4** | gateway retry-audio 端点 | 中 | 无 |
| **5** | 时间线 pending_retry UI + 重试交互 | 中 | Phase 3+4 |
| **6** | App 启动检查 + 清理策略 | 低 | Phase 3 |

Phase 1 和 Phase 2 可并行。Phase 4 可与 Phase 2-3 并行。

---

## 依赖

- voice-routing.md — 三层路由（processEntry 复用）
- gateway/src/storage/oss.ts — PCM→WAV 转换 + OSS 上传
- gateway/scripts/asr_transcribe.py — upload 模式转写（retry 复用）

## 备注

- IndexedDB 选用原因：localStorage 有 5-10MB 限制，30 秒 PCM ≈ 960KB，IndexedDB 支持 binary 且无大小限制
- 不使用 Service Worker 离线缓存：复杂度过高，IndexedDB 足够
- retry 走 HTTP 而非 WS：HTTP 更可靠、支持大文件、有明确的请求/响应语义
- 本地播放 PCM 需在前端添加 WAV header 后通过 `new Audio(blobUrl)` 播放
