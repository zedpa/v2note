---
id: fix-recording-notify-stale
title: "Fix: 录音处理通知状态滞后"
status: completed
domain: voice
risk: low
dependencies: ["voice-routing.md", "recording-resilience.md"]
superseded_by: null
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 录音处理通知状态滞后

## Bug 现象
用户录音完成后，日记内容已经出现在时间线上（ASR 识别完成、Record 已创建），但 FAB 胶囊通知仍显示"处理中"文案（如"念念有路，正在整理..."），需要等待 AI 后处理（摘要/标签/待办提取）全部完成才消失。AI 后处理通常需要 5-30 秒，这段等待严重损耗用户体验。

## 根因分析
- `asr.done` 到达后前端设置 `processing=true`，显示"处理中"胶囊
- `asr.done` 同时触发 `recording:uploaded` 事件，刷新时间线 → 用户看到日记
- `processEntry()` 异步执行 AI 处理（摘要、标签、待办），完成后才发送 `process.result`
- 只有 `process.result` 到达才设置 `processing=false`，隐藏胶囊
- **时间差**：日记可见（T0）→ AI 处理完成（T0+5~30s）→ 胶囊消失，中间用户困惑

## 修复方案
将"处理中"胶囊的语义从"整个管线处理中"改为"ASR 识别中"，ASR 完成即切换为短暂成功提示。

### 具体改动：

**前端 `fab.tsx`**:
1. `asr.done` 收到 recordId 后：
   - 不再 `setProcessing(true)` 
   - 改为 `fabNotify.success("已记录")` 显示短暂成功通知（2s 自动消失）
   - 仍然 `emit("recording:uploaded")` 刷新时间线
   - 仍然 `startAiPipeline()` 追踪后台管道（全局 loading 指示器用）
2. `process.result` 收到后：
   - 不再需要 `setProcessing(false)`（已经是 false）
   - 仍然 `emit("recording:processed")` 刷新时间线（AI 摘要已更新）
   - 仍然管理 `pipelineIdRef` 生命周期

## 1. ASR 完成后立即反馈

### 场景 1.1: 正常录音完成 → 即时成功提示
```
假设 (Given)  用户已完成一段语音录音
当   (When)   后端 ASR 识别完成，发送 asr.done（含 recordId）
那么 (Then)   FAB 胶囊显示"已记录"成功提示，2 秒后自动消失
并且 (And)    时间线刷新显示新日记
并且 (And)    不再显示"处理中"旋转动画
```

### 场景 1.2: AI 后处理静默完成
```
假设 (Given)  ASR 已完成，"已记录"提示已消失
当   (When)   后端 AI 处理完成，发送 process.result
那么 (Then)   时间线静默刷新（日记摘要/标签更新）
并且 (And)    不弹出额外通知（移除原有的 fabNotify.success("处理完成")）
```

### 场景 1.3: AI 后处理失败
```
假设 (Given)  ASR 已完成，AI pipeline 正在后台运行（pipelineIdRef 非 null）
当   (When)   后端 AI 处理失败，发送 error
那么 (Then)   FAB 胶囊显示"整理失败"错误提示（用 pipelineIdRef 判断，不再依赖 processing 状态）
并且 (And)    日记内容不受影响（仅缺少摘要/标签）
并且 (And)    清理 pipelineIdRef
```

### 场景 1.4: ASR 本身失败
```
假设 (Given)  用户已完成录音
当   (When)   后端 ASR 识别失败，发送 asr.error
那么 (Then)   FAB 显示错误提示（行为不变，保持现有逻辑）
```

## 验收行为（E2E 锚点）

> 注意：本 bug 涉及 WebSocket 实时通信，E2E 难以精确模拟后端时序。
> 验收以手动测试 + 单元测试为主。

### 行为 1: 录音完成后立即看到成功反馈
1. 用户在首页长按 FAB 开始录音
2. 说一段话后松手
3. ASR 识别完成后，胶囊应显示"已记录"（绿色成功样式）
4. 2 秒内"已记录"自动消失
5. 时间线上可看到新日记
6. 不应出现长时间的"处理中"旋转动画

## 边界条件
- [x] ASR 完成但 process.result 永远不到达（WebSocket 断连）→ 用户已看到"已记录"，不受影响
- [x] process.result 到达时用户已离开页面 → 无副作用
- [x] 连续快速录音 → 每次 asr.done 各自触发独立的"已记录"提示
- [x] 30s 安全超时 → processing 已经是 false，超时逻辑不会误触发
- [x] error case 中 cacheIdRef 未清理 → 既有问题，不在本次修复范围

## 接口约定

无接口变更。WebSocket 消息格式不变，仅前端对 `asr.done` 和 `process.result` 的响应行为调整。

## Implementation Phases
- [ ] Phase 1: 修改 `fab.tsx` 中 `asr.done` 处理逻辑（移除 setProcessing(true)，改用 fabNotify.success("已记录")）
- [ ] Phase 2: 修改 `process.result` 处理逻辑（移除 fabNotify.success("处理完成") + setProcessing(false)，保留 emit 和 pipeline 管理）
- [ ] Phase 3: 修改 `error` case（用 pipelineIdRef.current 判断是否显示"整理失败"，替代 processing 状态检查）
- [ ] Phase 4: 清理 30s safety timeout（processing 不再被设为 true，超时逻辑冗余）

## 涉及文件
- `features/recording/components/fab.tsx` — 主要改动
- `shared/lib/fab-notify.ts` — 无需改动，复用现有 success 通知

## 备注
- `startAiPipeline()` / `endAiPipeline()` 仍保留，用于全局 AI 处理状态追踪（可能被其他组件使用）
- `WITTY_PROCESSING` 文案数组将不再被使用，可保留不删除（避免无关 diff）
- 本次只改前端，后端无变更
