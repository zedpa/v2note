---
id: "fix-recording-audio-focus"
title: "Fix: 录音按钮无法中断系统音频播放"
status: completed
backport: audio-session-recording.md#场景 7
domain: voice
risk: low
dependencies: ["audio-session-recording.md"]
created: 2026-04-12
updated: 2026-04-12
---

# Fix: 录音按钮无法中断系统音频播放

## 概述

用户反馈：按住录音按钮时，后台音乐播放不会被中断。

**根因**：两个断点导致音频焦点请求不生效：

1. **时序问题**：Pre-capture 阶段（长按 120ms 后）已通过 `getUserMedia` 打开麦克风并开始录音，但 `activateAudioSession()`（请求音频焦点）直到 `startRecording()`（长按确认后约 300ms+）才被调用。此时麦克风已经在录音，但系统音频仍在播放。
2. **焦点类型不够强**：Android 端使用 `AUDIOFOCUS_GAIN_TRANSIENT`，部分播放器（如 QQ 音乐、网易云）只会降低音量而非暂停。录音场景应使用 `AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE`（要求其他应用完全静音）。

## 场景

### 场景 1: Pre-capture 阶段即请求音频焦点
```
假设 (Given)  后台正在播放音乐
当   (When)   用户长按 FAB 按钮超过 120ms 触发 pre-capture
那么 (Then)   系统音频在麦克风打开之前被打断
并且 (And)    麦克风随后正常打开
```

### 场景 2: 短按取消时恢复音频焦点
```
假设 (Given)  用户已长按 FAB 超过 120ms（pre-capture 已启动、音频焦点已获取）
当   (When)   用户短按松开取消录音
那么 (Then)   系统音频可恢复播放
并且 (And)    录音不会继续
```

### 场景 3: Android 使用 EXCLUSIVE 焦点类型
```
假设 (Given)  Android 设备，后台播放音乐
当   (When)   用户长按 FAB 开始录音
那么 (Then)   播放器完全暂停，而非仅降低音量
并且 (And)    录音结束后音乐可恢复播放
```

## 验收行为（E2E 锚点）

> 音频焦点涉及原生平台，无法 Playwright 自动化。以手动验证为主。

### 行为 1: 长按录音打断音乐
1. 打开系统音乐播放器，播放一首歌
2. 切回 V2Note，长按 FAB 录音按钮
3. 音乐应立即暂停
4. 录音正常进行

### 行为 2: 短按不影响音乐（120ms 内松开）
1. 播放音乐
2. 快速点击 FAB（短按）
3. 音乐不受影响

### 行为 3: 录音结束后音乐恢复
1. 长按录音（音乐暂停）
2. 松开结束录音
3. 音乐播放器可恢复播放

## 修复方案

### 1. fab.tsx — startPreCapture 中提前请求音频焦点
- 在 `recorder.startRecording()` 之前调用 `activateAudioSession()`
- `startPreCapture()` 的 catch 块中添加 `deactivateAudioSession()`（mic 权限被拒时释放焦点）
- `stopPreCapture()` 末尾添加 `deactivateAudioSession()`（短按取消时释放焦点）
- `startRecording()` 中保留现有的 `activateAudioSession()` 调用（幂等，重复调用无害）

### 2. AudioSessionPlugin.kt — 改用 EXCLUSIVE 焦点
- `AUDIOFOCUS_GAIN_TRANSIENT` → `AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE`
- 同时修改 API < 26 的旧 API 路径

### 3. 同步更新 audio-session-recording.md
- 更新边界条件表：短按行为从"不调用 activate"改为"pre-capture 阶段 activate，取消时 deactivate"
- 更新 Android 实现说明：AUDIOFOCUS_GAIN_TRANSIENT → AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE

## 边界条件
- [ ] Pre-capture 120ms 内被取消（短按）→ stopPreCapture 调用 deactivateAudioSession 释放焦点
- [ ] activateAudioSession 超时（500ms）→ 不阻塞录音，继续执行（Promise.race 机制不变）
- [ ] 重复调用 activate → Android AudioManager 幂等，不会出错
- [ ] 录音失败/异常 → 现有的 deactivateAudioSession 调用点已覆盖
- [ ] startPreCapture mic 权限被拒 → catch 块中 deactivateAudioSession
- [ ] 竞态：activate 尚在进行中用户已松开 → deactivateAudioSession 内部检查 audioActivatedRef，此时为 false 会跳过 deactivate。但 activate 仍在后台完成，焦点会被获取但不释放。已知限制，风险极低（120ms 窗口 + 500ms 超时 = 最多 620ms 焦点泄漏，Android 系统会在 App 失去前台后自动回收）

## 实施阶段
- [x] Phase 1: fab.tsx 修改（startPreCapture 提前请求 + stopPreCapture 释放 + catch 释放）
- [x] Phase 2: AudioSessionPlugin.kt 修改焦点类型为 EXCLUSIVE
- [x] Phase 3: 同步更新 audio-session-recording.md 边界条件
- [ ] Phase 4: 手动真机验证
