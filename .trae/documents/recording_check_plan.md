# 录音链路与快速松手处理机制检查计划

根据用户指令，我们需要检查录音从按下按钮进入缓存到发送的全链路，特别是**单击后快速松手（Quick Release）**场景下，缓存是否被正确丢弃，以避免误发录音或残留脏数据。同时结合 `genes.md` 理解最新改动。

## 1. 分析现状 (基于代码与文档)

### 1.1 `genes.md` 最新改动回顾
- **Pre-capture (预采集)**：为了实现“按下即录”，在 `onPointerDown` 时立即启动麦克风并开始缓冲 PCM 数据 (`preBufferRef`)，而不是等待长按判定。
- **Quick Release 策略**：如果判定为短按（Click/Tap），需要立即停止采集并**丢弃**已缓冲的数据，不应发送到后端。

### 1.2 代码逻辑审计 (`fab.tsx` & `use-fab-gestures.ts`)
- **按下 (Press)**:
  - `onPointerDown` -> `startPreCapture()`
  - `recorder.startRecording()` 启动，数据推入 `preBufferRef.current`。
- **快速松手 (Quick Release / Tap)**:
  - `useFabGestures` 判定时长 < 300ms，触发 `onTap`。
  - `onTap` -> `stopPreCapture()`。
  - `stopPreCapture` 执行：
    - `preCaptureAbortRef.current = true` (标记废弃)
    - `recorder.cancelRecording()` (停止麦克风)
    - `preBufferRef.current = []` (清空缓冲区)
    - `gwClientRef.current = null`
- **竞态处理**:
  - 如果 `startRecording` 初始化较慢，在松手后才完成：`startPreCapture` 中的 `await` 后续逻辑检查了 `preCaptureAbortRef`，若为 `true` 则再次执行清理和清空。

**理论结论**：逻辑上是闭环的，缓存会被丢弃，不会发送。

## 2. 验证计划

为了在运行时验证上述逻辑的可靠性，计划在关键节点增加详细的调试日志。

### 2.1 添加调试日志 (`features/recording/components/fab.tsx`)
在以下位置添加 `console.log`：
1.  **`startPreCapture`**: 打印 "Starting pre-capture..."
2.  **`onPCMData` (Pre-buffer phase)**: 打印 "Buffering chunk, size: N, total buffered: M"
3.  **`stopPreCapture`**: 打印 "Stopping pre-capture (Quick Release), discarding N chunks"
4.  **`startRecording` (Long Press)**: 打印 "Flushing pre-buffer to gateway: N chunks"
5.  **`startPreCapture` (Abort check)**: 打印 "Pre-capture aborted after init, cleaning up"

### 2.2 预期行为验证
- **操作**：单击 FAB 按钮并快速松手。
- **预期日志**：
  1.  "Starting pre-capture..."
  2.  (可能) "Buffering chunk..." (取决于松手速度和设备性能)
  3.  "Stopping pre-capture (Quick Release)..."
  4.  **绝不出现**: "Flushing pre-buffer to gateway"
  5.  (可能) "Pre-capture aborted after init..."

- **操作**：长按 FAB 按钮。
- **预期日志**：
  1.  "Starting pre-capture..."
  2.  "Buffering chunk..." (多条)
  3.  "Flushing pre-buffer to gateway..."

## 3. 执行步骤

1.  修改 `g:\AI\abc\v2note\features\recording\components\fab.tsx`，注入上述调试日志。
2.  通知用户进行测试验证。
