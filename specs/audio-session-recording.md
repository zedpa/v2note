---
id: 121
title: 录音音频会话管理 — 打断与恢复系统音频
status: completed
domain: voice
risk: medium
created: 2026-04-09
updated: 2026-04-09
dependencies: [recording-resilience.md]
related: [voice-input-unify.md]
---

# 录音音频会话管理

## 概述

按住录音时自动打断系统音频播放（如后台音乐），录音结束后通知系统恢复播放。
需要 Capacitor 原生插件实现 iOS / Android 音频会话控制，Web 降级为 no-op。

> 本 spec 仅覆盖 FAB 录音路径。ChatView 语音输入（114 voice-input-unify）因时长极短且不创建 record，暂不纳入音频会话管理。

## 现状

- FAB 录音使用 `usePCMRecorder`（Web Audio API `getUserMedia` + AudioWorklet）
- 在 iOS WKWebView 中，`getUserMedia` 会隐式创建 AVAudioSession，可能打断部分音频
- 但 **没有显式的音频会话管理**：不保证打断、不保证恢复
- Android WebView 类似：无显式 AudioFocus 管理

## 场景

### 场景 1: 录音开始打断系统音频

- Given 后台正在播放音乐（Apple Music / QQ 音乐 / 网易云 等）
- When 用户按住 FAB 开始录音（长按确认后触发 `startRecording`）
- Then 音乐播放被暂停
- And 录音正常开始，ASR 流式传输正常

### 场景 2: 录音正常结束恢复音频

- Given 录音进行中，系统音频已被打断
- When 用户松开 FAB 或上滑结束录音（触发 `finishRecording`）
- Then 系统收到恢复通知，之前被打断的音频应用可自行恢复播放

### 场景 3: 取消录音恢复音频

- Given 录音进行中
- When 用户左滑取消录音（触发 `cancelRecording`）
- Then 系统音频恢复播放

### 场景 4: 录音失败/异常恢复音频

- Given 录音进行中（activate 已调用）
- When 录音因以下任一原因中断：
  - 网络连接失败（`startRecording` catch 块）
  - 麦克风异常（`recorder.onError` 回调）
  - ASR 识别超时（`asr.done` 15s 超时 → `handleRecordingFailure`）
  - Gateway 返回 `asr.error`（→ `handleRecordingFailure`）
- Then 系统音频恢复播放（不泄漏音频会话）

### 场景 5: 锁定模式全程打断

- Given 录音已右滑进入锁定模式
- When 用户按暂停键
- Then 系统音频 **保持打断状态**（不恢复）
- When 用户按停止键结束录音
- Then 系统音频恢复
- **或** When 用户按取消（X）键
- Then 系统音频恢复（走 `cancelRecording` 路径）

### 场景 6: Web 平台降级

- Given 运行在浏览器环境（非 Capacitor native）
- When 用户开始/结束录音
- Then 音频会话管理不执行（no-op）
- And 录音功能正常，无报错

## 边界条件

| 条件 | 预期行为 |
|------|---------|
| 没有音频在播放时录音 | 正常录音，deactivate 为 no-op（OS 层面无副作用） |
| 快速连续录音（上一条刚结束立刻下一条） | 每次 activate 独立，deactivate 在录音结束时调用 |
| 应用切后台再切回 | 音频会话状态由 OS 管理，不额外处理 |
| activate/deactivate 抛异常 | catch 并静默（console.warn），不阻塞录音流程 |
| 短按（< 300ms 未触发录音） | pre-capture 阶段已 activate，stopPreCapture 中 deactivate 释放焦点（fix-recording-audio-focus） |
| `startRecording()` 中 activate 成功但后续步骤失败 | catch 块中必须 deactivate（使用 `activatedRef` 追踪状态） |

## 接口约定

### TypeScript 接口

```typescript
// shared/lib/audio-session.ts
interface AudioSessionPlugin {
  /** 激活录音会话，打断其他音频 */
  activate(): Promise<void>;
  /** 停用录音会话，通知其他音频可恢复 */
  deactivate(): Promise<void>;
}

export const AudioSession: AudioSessionPlugin;
```

**activate() 调用策略**：`await` 调用，但使用 `Promise.race` 设 500ms 超时。超时则跳过继续录音（极少发生，接受音乐可能晚几百毫秒停止）。

**deactivate() 调用时机**：在 `recorder.stopRecording()` 之后立即调用，不等待 IndexedDB 缓存写入完成，避免音频恢复因磁盘 IO 而延迟。

### iOS 实现（Swift，Capacitor 8 本地插件）

```
文件: ios/App/App/AudioSessionPlugin.swift

AVAudioSession 配置:
- category: .playAndRecord
- options: [.defaultToSpeaker]
- setActive(true) on activate
- setActive(false, options: .notifyOthersOnDeactivation) on deactivate
```

### Android 实现（Kotlin，Capacitor 8 本地插件）

```
文件: android/app/src/main/java/com/v2note/app/AudioSessionPlugin.kt

AudioManager 配置:
- API 26+: AudioFocusRequest.Builder(AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE).build()
  + requestAudioFocus(request) / abandonAudioFocusRequest(request)
- API < 26: requestAudioFocus(listener, STREAM_MUSIC, AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
  + abandonAudioFocus(listener)

项目 minSdk 如果 >= 26 则只需新 API 路径。
```

### Web 降级

```typescript
// Capacitor.isNativePlatform() === false 时
activate() → Promise.resolve()  // no-op
deactivate() → Promise.resolve()  // no-op
```

## 集成点

FAB 录音生命周期中，通过 `activatedRef`（useRef<boolean>）追踪音频会话状态，在统一的辅助函数中调用 deactivate：

```typescript
// fab.tsx 内部
const audioActivatedRef = useRef(false);

async function activateAudioSession() {
  try {
    await Promise.race([AudioSession.activate(), sleep(500)]);
    audioActivatedRef.current = true;
  } catch { /* 静默 */ }
}

async function deactivateAudioSession() {
  if (!audioActivatedRef.current) return;
  audioActivatedRef.current = false;
  try { await AudioSession.deactivate(); } catch { /* 静默 */ }
}
```

| 时机 | 调用 | 位置 |
|------|------|------|
| 长按确认开始录音 | `activateAudioSession()` | `fab.tsx` → `startRecording()` 开头 |
| 正常结束 | `deactivateAudioSession()` | `fab.tsx` → `finishRecording()` 内 `recorder.stopRecording()` 之后 |
| 取消录音 | `deactivateAudioSession()` | `fab.tsx` → `cancelRecording()` |
| 录音失败/缓存 | `deactivateAudioSession()` | `fab.tsx` → `handleRecordingFailure()` 开头 |
| startRecording catch | `deactivateAudioSession()` | `fab.tsx` → `startRecording()` catch 块 |
| recorder.onError | `deactivateAudioSession()` | `fab.tsx` → PCM recorder onError 回调 |
| asr.done 超时 | 走 `handleRecordingFailure` → 已覆盖 | `fab.tsx:533` setTimeout 回调 |

**注意**：`activatedRef` 保证 deactivate 只在 activate 成功后才调用。pre-capture 阶段已调用 activate，短按取消时 stopPreCapture 中会调用 deactivate 释放焦点（fix-recording-audio-focus）。

## 实现阶段

### Phase A: 原生插件 + TypeScript 封装
1. 创建 `shared/lib/audio-session.ts`（带 Web no-op 降级 + 500ms 超时）
2. 创建 iOS Swift 插件 `AudioSessionPlugin.swift`
3. 创建 Android Kotlin 插件 `AudioSessionPlugin.kt`
4. 在 Capacitor bridge 中注册插件

### Phase B: FAB 集成
1. 在 `fab.tsx` 添加 `audioActivatedRef` + `activateAudioSession` / `deactivateAudioSession`
2. 在所有录音退出路径中插入 `deactivateAudioSession()` 调用
3. 单元测试：验证 activate/deactivate 在各生命周期路径中的调用时机

## 验收行为（E2E 锚点）

由于涉及原生音频会话 + 物理设备音频播放，无法通过 Playwright 自动化验证。
验收以 **手动真机测试** 为主：

1. **打断**: iOS/Android 后台播放音乐 → 按住录音 → 音乐停止 → 录音波形正常显示
2. **恢复（正常结束）**: 松开结束录音 → 音乐自动继续
3. **恢复（取消）**: 左滑取消 → 音乐自动继续
4. **恢复（失败）**: 断网后录音 → 连接失败 → 音乐自动继续
5. **锁定模式**: 右滑锁定 → 暂停/恢复 → 音乐全程不播 → 停止 → 音乐继续
6. **锁定取消**: 右滑锁定 → 按 X 取消 → 音乐自动继续
7. **Web 降级**: 浏览器中录音正常，控制台无错误
8. **无音乐时**: 正常录音，不影响任何功能
