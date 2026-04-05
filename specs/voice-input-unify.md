---
id: "114"
title: "Voice Input Unify — 录音入口统一"
status: active
domain: voice
dependencies: ["voice-routing.md"]
superseded_by: null
created: 2026-04-04
updated: 2026-04-04
---

# Voice Input Unify — 录音入口统一

## 概述

项目中有 3 个录音入口，但仅 FAB 走通了 gateway ASR 管线。InputBar 是未被引用的死代码，ChatView 使用浏览器原生 SpeechRecognition（移动端不可靠）。本 spec 统一录音入口：

1. **删除 InputBar 死代码**
2. **ChatView 语音接入 gateway ASR**：录音 → 转写 → 填入输入框（不创建 record）
3. **提取可复用 hook** `useVoiceToText`：封装"录音→gateway ASR→拿 transcript"流程
4. **触控按钮 ≥ 44px**（Apple HIG 最低标准）

---

## 1. 清理 InputBar 死代码

### 场景 1.1: 删除 InputBar 组件
```
假设 (Given)  features/recording/components/input-bar.tsx 存在但无任何页面引用
当   (When)   执行清理
那么 (Then)   删除 input-bar.tsx 文件
并且 (And)    确认无其他文件 import InputBar
```

---

## 2. 可复用 hook: useVoiceToText

> 目标：封装 gateway ASR 管线，提供"按下录音→松开→回调 transcript"能力，
> 供 ChatView 等非 FAB 场景使用。

### 场景 2.1: 开始录音
```
假设 (Given)  组件调用 useVoiceToText()
当   (When)   调用 start()
那么 (Then)   连接 gateway（if !connected → connect + waitForReady）
并且 (And)    发送 asr.start { mode: "realtime", sourceContext: "chat", saveAudio: false }
并且 (And)    启动 usePCMRecorder，PCM chunk 推送 gateway
并且 (And)    状态变为 recording=true
```

### 场景 2.2: 实时部分结果
```
假设 (Given)  录音进行中
当   (When)   gateway 返回 asr.partial / asr.sentence
那么 (Then)   hook 输出 partialText / confirmedText 实时更新
```

### 场景 2.3: 结束录音获取 transcript
```
假设 (Given)  录音进行中
当   (When)   调用 stop()
那么 (Then)   停止 PCM 采集
并且 (And)    发送 asr.stop { saveAudio: false, forceCommand: true }
并且 (And)    等待 asr.done → onTranscript(text) 回调
并且 (And)    状态变为 recording=false
```

### 场景 2.4: 取消录音
```
假设 (Given)  录音进行中
当   (When)   调用 cancel()
那么 (Then)   停止 PCM 采集
并且 (And)    发送 asr.cancel
并且 (And)    不触发 onTranscript
并且 (And)    状态变为 recording=false
```

### 场景 2.5: 连接失败
```
假设 (Given)  gateway 不可达
当   (When)   调用 start()
那么 (Then)   onError("无法连接服务器") 回调
并且 (And)    不启动录音
```

### 场景 2.6: ASR 错误
```
假设 (Given)  录音进行中
当   (When)   gateway 返回 asr.error
那么 (Then)   停止录音
并且 (And)    onError(message) 回调
```

---

## 3. ChatView 语音输入

### 场景 3.1: 点击麦克风按钮开始录音
```
假设 (Given)  ChatView 输入区，用户输入框为空
当   (When)   点击麦克风按钮（≥ 44×44px）
那么 (Then)   调用 useVoiceToText.start()
并且 (And)    按钮变为红色脉冲态（recording indicator）
并且 (And)    输入框显示实时 partialText（灰色预览）
```

### 场景 3.2: 再次点击结束录音
```
假设 (Given)  录音进行中
当   (When)   点击麦克风按钮（此时为停止按钮）
那么 (Then)   调用 useVoiceToText.stop()
并且 (And)    等待 transcript 回调
并且 (And)    将 transcript 填入输入框（不自动发送，用户可编辑）
并且 (And)    按钮恢复正常态
```

### 场景 3.3: 有文字时隐藏麦克风
```
假设 (Given)  输入框已有文字
当   (When)   渲染按钮区
那么 (Then)   麦克风按钮隐藏，显示发送按钮
```

### 场景 3.4: 录音中发送流式结果
```
假设 (Given)  录音中，实时转写显示在输入框
当   (When)   asr.done 返回最终 transcript
那么 (Then)   用最终 transcript 替换输入框内容（覆盖 partial）
```

---

## 4. Gateway 支持 saveAudio=false

> 当前 gateway 的 `finishRealtimeASR` 总是创建 record + 触发 processEntry。
> 需要增加一个 "transcript-only" 路径。

### 场景 4.1: asr.start 携带 saveAudio=false
```
假设 (Given)  前端发送 asr.start { ..., saveAudio: false }
当   (When)   gateway 创建 ASR session
那么 (Then)   session.saveAudio = false
```

### 场景 4.2: transcript-only 模式下不创建 record
```
假设 (Given)  session.saveAudio === false 且 forceCommand === false
当   (When)   finishRealtimeASR / finishUploadASR 完成
那么 (Then)   发送 asr.done { transcript, recordId: "", duration }
并且 (And)    不调用 createRecordAndProcess
并且 (And)    不上传 OSS
并且 (And)    清理临时文件
```

---

## 5. 按钮尺寸规范

### 场景 5.1: ChatView 麦克风按钮 ≥ 44px
```
假设 (Given)  ChatView 底部输入栏
当   (When)   渲染麦克风 / 发送按钮
那么 (Then)   按钮 w-11 h-11（44×44px）
并且 (And)    图标 size={20}
```

---

## 边界条件

- [ ] 录音 < 1 秒 → gateway 返回空 transcript → 输入框不变
- [ ] 录音中用户切走 ChatView → cancel() 自动清理
- [ ] 多次快速点击 → start() 内防重复（usePCMRecorder 已有 activeRef 保护）
- [ ] gateway 断连重连中 → waitForReady 超时 → onError

## 接口约定

```typescript
// features/recording/hooks/use-voice-to-text.ts

interface UseVoiceToTextOptions {
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
  sourceContext?: "chat" | "review";
}

interface UseVoiceToTextReturn {
  recording: boolean;
  confirmedText: string;
  partialText: string;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}
```

```typescript
// gateway WS 协议扩展
// asr.start payload 新增 saveAudio?: boolean
{ type: "asr.start", payload: { deviceId, mode, saveAudio?: boolean, ... } }
```

## 关键文件变更

| 文件 | 变更 |
|------|------|
| `features/recording/components/input-bar.tsx` | **删除** |
| `features/recording/hooks/use-voice-to-text.ts` | **新建** — 可复用 hook |
| `features/chat/components/chat-view.tsx` | 替换 SpeechRecognition → useVoiceToText，按钮 44px |
| `gateway/src/index.ts` | asr.start payload 传递 saveAudio |
| `gateway/src/handlers/asr.ts` | startASR 接收 saveAudio；finish 时判断是否跳过 record 创建 |

## 实施顺序

| Phase | 内容 | 依赖 |
|-------|------|------|
| 1 | 删除 input-bar.tsx 死代码 | 无 |
| 2 | Gateway: saveAudio=false transcript-only 路径 | 无 |
| 3 | 新建 useVoiceToText hook | Phase 2 |
| 4 | ChatView 接入 useVoiceToText + 按钮规范 | Phase 3 |

Phase 1 和 Phase 2 可并行。

## 依赖

- voice-routing.md — gateway ASR 管线
- usePCMRecorder — 麦克风 PCM 采集
- gateway-client — WS 连接管理

## 备注

- saveAudio=false 时不走 forceCommand 逻辑（不通过 voice-routing 三层路由），纯粹返回 transcript
- ChatView 录音不需要手势（长按/滑动），用简单的点击切换即可
- 未来 InputBar 如果恢复，应复用 useVoiceToText 而非重复实现
