/**
 * FAB Capture — 把 FAB 录音结束时的 PCM chunks 落地到本地 captureStore。
 *
 * regression: fix-cold-resume-silent-loss (Phase 4)
 *
 * 为了让 FAB 的核心"落地"逻辑可测试，这里做薄封装：
 *   - 纯函数 buildCaptureFromPcm：计算 duration、合并 chunks、裁剪短于 1s 的录音
 *   - 异步函数 saveFabCapture：注入 captureStore + 触发 sync，返回 saved 的 CaptureRecord
 *
 * FAB 组件只负责把用户手势映射为一次 saveFabCapture 调用。
 */

import type { CaptureRecord, CaptureSource } from "@/shared/lib/capture-store";
import { captureStore } from "@/shared/lib/capture-store";
import { triggerSync as defaultTriggerSync } from "@/shared/lib/sync-orchestrator";
import { mergeChunks } from "./audio-cache";

/** 16kHz 16-bit mono → 每秒 32000 字节 */
const BYTES_PER_SECOND = 16000 * 2;

/** 最短录音（秒），短于此值视为"误触"不落地 */
export const MIN_DURATION_SEC = 1;

export interface BuildCaptureResult {
  /** 合并后的 PCM ArrayBuffer（可能为空 → 代表录音太短） */
  pcmData: ArrayBuffer | null;
  /** 录音时长（秒，四舍五入） */
  durationSec: number;
  /** 是否满足落地的最低条件 */
  shouldSave: boolean;
}

/**
 * 纯函数：将 FAB 累积的 PCM chunks 判断是否值得落地。
 * 分离出来便于直接断言"短于 1s 丢弃"的边界逻辑。
 */
export function buildCaptureFromPcm(chunks: ArrayBuffer[]): BuildCaptureResult {
  if (!chunks || chunks.length === 0) {
    return { pcmData: null, durationSec: 0, shouldSave: false };
  }
  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const durationSec = totalBytes / BYTES_PER_SECOND;
  if (durationSec < MIN_DURATION_SEC) {
    return { pcmData: null, durationSec, shouldSave: false };
  }
  return {
    pcmData: mergeChunks(chunks),
    durationSec: Math.round(durationSec),
    shouldSave: true,
  };
}

export interface SaveFabCaptureInput {
  chunks: ArrayBuffer[];
  asCommand: boolean;
  notebook: string | null;
  userId: string | null;
  /** "fab" | "fab_command" | "chat_voice" 等；由调用方依据入口决定 */
  sourceContext: CaptureSource;
}

export interface SaveFabCaptureDeps {
  store?: typeof captureStore;
  triggerSync?: () => void;
}

export interface SaveFabCaptureResult {
  saved: CaptureRecord | null;
  /** 未保存的原因（录音太短等） */
  skipReason?: "too_short" | "no_data";
}

/**
 * C3：PCM 采集门闩。
 *
 * 使用场景：recorder.stopRecording() 是异步操作，在它 resolve 之前，worklet 仍
 * 可能回调 onPCMData 推送尾帧。若这些尾帧在新一次录音开始后才到达，会污染
 * fullBufferRef。门闩提供一个"关闭后丢弃后续帧"的简单约束。
 *
 * 典型用法：
 *   const gate = createPcmGate();
 *   onPCMData(chunk) { if (!gate.accept()) return; fullBufferRef.push(chunk); }
 *   stopping: gate.close(); await recorder.stopRecording();
 *   starting: gate.open();
 */
export interface PcmGate {
  accept(): boolean;
  close(): void;
  open(): void;
  readonly closed: boolean;
}

export function createPcmGate(): PcmGate {
  let closed = false;
  return {
    accept() {
      return !closed;
    },
    close() {
      closed = true;
    },
    open() {
      closed = false;
    },
    get closed() {
      return closed;
    },
  };
}

/**
 * C1：finishRecording 在指令模式下应如何与 gateway 交互。
 *
 * 抽出为纯函数便于单测：
 *   - asCommand=true + ws 已连 → 发 asr.stop { forceCommand: true } 触发命令路由
 *   - asCommand=true + ws 未连 → 不发任何 WS 消息；UI 文案提示"联网后执行"
 *   - asCommand=false → 不触发任何 forceCommand 分发
 */
export interface FinishDispatchInput {
  asCommand: boolean;
  wsConnected: boolean;
  sessionId: string | null;
}

export type FinishDispatchAction =
  | { type: "send_asr_stop_force_command"; payload: { forceCommand: true; saveAudio: false; sessionId: string | undefined } }
  | { type: "send_asr_cancel" }
  | { type: "noop_offline_command" }
  | { type: "noop" };

export function decideFinishDispatch(input: FinishDispatchInput): FinishDispatchAction {
  if (input.asCommand) {
    if (input.wsConnected) {
      return {
        type: "send_asr_stop_force_command",
        payload: {
          forceCommand: true,
          saveAudio: false,
          sessionId: input.sessionId ?? undefined,
        },
      };
    }
    return { type: "noop_offline_command" };
  }
  // 普通录音：WS 在线则 cancel partial 流
  if (input.wsConnected) {
    return { type: "send_asr_cancel" };
  }
  return { type: "noop" };
}

/**
 * M3：asr.done 是否应当被当前录音接收。
 *
 * 纯函数判定便于单测：
 *   - payload.sessionId 与 activeSessionId 不一致 → 忽略
 *   - payload 无 sessionId 且仍在录音（activeSessionId 非空）→ 忽略（属于上一轮）
 *   - 其余情况 → 接收
 */
export function shouldAcceptAsrDone(
  payloadSessionId: string | undefined,
  activeSessionId: string | null,
): boolean {
  if (payloadSessionId && payloadSessionId !== activeSessionId) return false;
  if (!payloadSessionId && activeSessionId !== null) return false;
  return true;
}

/**
 * 执行落地：原子写入 captures + audio_blobs，并触发一次 sync。
 *
 * 失败（IndexedDB quota 等）由上层 try/catch 兜底到 audio-cache。
 */
export async function saveFabCapture(
  input: SaveFabCaptureInput,
  deps: SaveFabCaptureDeps = {},
): Promise<SaveFabCaptureResult> {
  const store = deps.store ?? captureStore;
  const trigger = deps.triggerSync ?? defaultTriggerSync;

  const built = buildCaptureFromPcm(input.chunks);
  if (!built.shouldSave) {
    return {
      saved: null,
      skipReason: input.chunks.length === 0 ? "no_data" : "too_short",
    };
  }

  const saved = await store.create({
    kind: "diary",
    text: null,
    audioLocalId: null, // 让 store 内部 genId
    sourceContext: input.sourceContext,
    forceCommand: input.asCommand,
    notebook: input.notebook,
    userId: input.userId,
    audioBlob: {
      pcmData: built.pcmData as ArrayBuffer,
      duration: built.durationSec,
    },
  });

  // 立即触发一次 sync（有网时秒级同步；无网时静默排队）
  try {
    trigger();
  } catch {
    // triggerSync 内部已 catch；这里再兜底一层
  }

  return { saved };
}
