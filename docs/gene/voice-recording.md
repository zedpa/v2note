## gene_voice_recording
### 功能描述
语音录制与 ASR 转写。支持两种识别模式：**实时识别**和**录后识别**，均通过 Python DashScope SDK 子进程实现（`fun-asr-realtime` 模型 + `disfluency_removal_enabled` 去语气词）。用户可在设置中切换。实时模式边录边出文字；录后模式录音结束后统一识别。

### 录音阶段（三阶段设计）
- **pressing 阶段**（按下即刻）：立即启动麦克风（pre-capture），PCM 数据缓存到 `preBufferRef`。如果是 tap 则取消麦克风并丢弃缓冲。消除 300ms 长按检测延迟导致的开头语音丢失
- **recording 阶段**（300ms 长按触发）：连接 ASR，flush 缓冲区到 gateway，切换到实时流模式。进入全屏暗色剧场模式——32根大波形随方向变色、边缘56x56方向图标（X取消/Command指令/Lock常驻）选中1.3x放大+彩色发光、方向感知 radial gradient 光晕、text-5xl 计时器+红色呼吸灯、FAB 弹性跟随手指。详见 [recording-immersive.md](./recording-immersive.md)
- **locked 阶段**（右滑锁定）：进入全屏常驻录音界面（RecordingImmersive），text-7xl超大计时器、大波形容器、三按钮横排（取消/暂停/完成）

### 详细功能
- 功能1：FAB 按钮手势控制（长按开始录音，松开立即发送，左滑/左上取消，右滑/右上锁定，正上滑松手转语音指令）
- 功能1a：Pre-capture 零丢音 — 按下即开麦缓存 PCM（`preBufferRef`），长按触发后 flush 缓冲区到 gateway 再切实时流（`streamingRef`）；tap 时通过 `stopPreCapture` 取消麦克风；`preCaptureAbortRef` 处理 mic await 期间被 tap 中断的竞态；`usePCMRecorder.activeRef` 同步 ref 防止双重 AudioContext 创建（React state `isRecording` 异步更新不可靠）
- 功能2：PCM 音频采集（Web Audio API worklet），实时计算 RMS 音量
- 功能3：WebSocket 二进制帧传输 PCM 数据
- 功能4a：**实时识别模式** — Gateway spawn Python 子进程 `asr_realtime.py`，通过 stdin 流式输入 PCM、stdout JSON 行输出事件（partial/sentence/complete），EOF 触发 stop。模型：fun-asr-realtime，去语气词已启用
- 功能4b：**录后识别模式** — Gateway 累积 PCM 数据，录音结束后转换为 WAV，spawn Python 子进程 `asr_transcribe.py`，stdin 输入 WAV、stdout 输出 JSON 结果。模型：fun-asr-realtime（Recognition.call），去语气词已启用
- 功能5：ASR 模式切换 — 设置页「语音识别模式」可选「实时识别」或「录后识别」，前端读取 asrMode 设置传给 Gateway
- 功能6：录音完成后创建 record + transcript，触发 AI 处理
- 功能7：全屏常驻录音界面（仅 locked 阶段）——中间方块按钮点击可暂停/继续；暂停后左侧显示 X（取消录音），右侧显示 ✓（完成录音）
- 功能8：上滑语音指令模式——上滑松手后仅做转写并进入命令执行流程（不创建日记）
- 功能9：音量响应声波可视化（中央波形随实际音量大小动态变化）

### 关键文件
- `features/recording/components/fab.tsx` — FAB 组件（图标放大，位置上移30px）
- `features/recording/components/recording-immersive.tsx` — 全屏沉浸录音（三色块 + 音量波形）
- `features/recording/hooks/use-pcm-recorder.ts` — PCM 录音 hook
- `features/recording/hooks/use-fab-gestures.ts` — 手势 hook
- `gateway/src/handlers/asr.ts` — ASR 处理器（spawn Python 子进程，不再直接调用 DashScope API）
- `gateway/scripts/asr_realtime.py` — Python 实时流式 ASR（stdin PCM → stdout JSON 行事件）
- `gateway/scripts/asr_transcribe.py` — Python 录后 ASR（stdin WAV → stdout JSON 结果）
- `public/worklets/pcm-processor.js` — Web Audio worklet
- `shared/lib/gateway-url.ts` — Gateway URL 运行时管理（WebSocket + HTTP）
- `shared/lib/api.ts` — REST API 客户端（HTML 响应容错）

### UI 规格（v2026.02.27d）
- FAB 按钮：`w-16 h-16`（64px），`bottom-[54px]`（上移30px）
- Mic 图标：`w-8 h-8`（32px）
- recording 阶段：仅显示波形+计时+拖拽提示气泡，无三色方向标签，无拖拽背景渐变
- locked 阶段中心控件：方块按钮常驻居中；暂停后两侧浮出 X / ✓ 操作按钮

### 测试描述
- 输入1：长按 FAB 后向右拖拽（或右上）并松手
- 输出1：进入常驻录音界面，中心方块可暂停/继续；暂停后可点 X 取消或 ✓ 完成
- 输入2：长按 FAB 后正上拖拽并松手
- 输出2：进入语音指令流程（不新增日记），转写文本直接用于指令执行
- 输入3：长按 FAB 后向左拖拽（或左上）并松手
- 输出3：录音取消
