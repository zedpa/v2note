/**
 * Quick Capture — 极简捕获页核心逻辑
 *
 * 负责文字/语音捕获的数据落地，复用 capture-store + 触发 sync。
 * 不含 UI 组件，仅含纯函数和异步操作。
 */

import type {
  CaptureRecord,
  CaptureSource,
  CaptureCreateInput,
} from "@/shared/lib/capture-store";
import { captureStore } from "@/shared/lib/capture-store";

/** 录音时长上限（秒） */
export const MAX_RECORDING_DURATION_SEC = 5 * 60; // 5 分钟

/** 静音自动结束阈值（秒） */
export const SILENCE_TIMEOUT_SEC = 5;

/** 完成动画展示时长（毫秒） */
export const SUCCESS_ANIMATION_MS = 1000;

/** 16kHz 16-bit mono → 每秒 32000 字节 */
const BYTES_PER_SECOND = 16000 * 2;

// ──────────────────────────────────────────────────────────────
// 文字捕获
// ──────────────────────────────────────────────────────────────

export interface SaveTextCaptureInput {
  text: string;
  sourceContext: CaptureSource;
  userId: string | null;
  guestBatchId?: string | null;
}

export interface SaveTextCaptureResult {
  saved: CaptureRecord | null;
  /** 未保存原因 */
  error?: "empty_text";
}

export interface SaveTextCaptureDeps {
  store?: typeof captureStore;
  triggerSync?: () => void;
}

/**
 * 保存文字捕获到 capture-store 并触发同步。
 *
 * 空文字（去空格后为空）不保存，返回 error="empty_text"。
 */
export async function saveTextCapture(
  input: SaveTextCaptureInput,
  deps: SaveTextCaptureDeps = {},
): Promise<SaveTextCaptureResult> {
  const store = deps.store ?? captureStore;

  const trimmed = input.text.trim();
  if (!trimmed) {
    return { saved: null, error: "empty_text" };
  }

  const createInput: CaptureCreateInput = {
    kind: "diary",
    text: trimmed,
    audioLocalId: null,
    sourceContext: input.sourceContext,
    forceCommand: false,
    notebook: null,
    userId: input.userId,
    guestBatchId: input.userId === null ? (input.guestBatchId ?? null) : null,
  };

  const saved = await store.create(createInput);

  // 触发同步
  try {
    const trigger = deps.triggerSync ?? (await loadTriggerSync());
    trigger();
  } catch {
    // 同步失败不影响本地保存
  }

  return { saved };
}

// ──────────────────────────────────────────────────────────────
// 语音捕获
// ──────────────────────────────────────────────────────────────

export interface SaveVoiceCaptureInput {
  chunks: ArrayBuffer[];
  sourceContext: CaptureSource;
  userId: string | null;
  guestBatchId?: string | null;
}

export interface SaveVoiceCaptureResult {
  saved: CaptureRecord | null;
  /** 未保存原因 */
  error?: "no_data" | "too_short";
}

export interface SaveVoiceCaptureDeps {
  store?: typeof captureStore;
  triggerSync?: () => void;
  mergeChunks?: (chunks: ArrayBuffer[]) => ArrayBuffer;
}

/** 最短录音（秒），短于此值视为误触 */
export const MIN_VOICE_DURATION_SEC = 1;

/**
 * 保存语音捕获到 capture-store 并触发同步。
 */
export async function saveVoiceCapture(
  input: SaveVoiceCaptureInput,
  deps: SaveVoiceCaptureDeps = {},
): Promise<SaveVoiceCaptureResult> {
  const store = deps.store ?? captureStore;

  if (!input.chunks || input.chunks.length === 0) {
    return { saved: null, error: "no_data" };
  }

  const totalBytes = input.chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const durationSec = totalBytes / BYTES_PER_SECOND;

  if (durationSec < MIN_VOICE_DURATION_SEC) {
    return { saved: null, error: "too_short" };
  }

  const merge = deps.mergeChunks ?? defaultMergeChunks;
  const pcmData = merge(input.chunks);
  const roundedDuration = Math.round(durationSec);

  const createInput: CaptureCreateInput = {
    kind: "diary",
    text: null,
    audioLocalId: null,
    sourceContext: input.sourceContext,
    forceCommand: false,
    notebook: null,
    userId: input.userId,
    guestBatchId: input.userId === null ? (input.guestBatchId ?? null) : null,
    audioBlob: {
      pcmData,
      duration: roundedDuration,
    },
  };

  const saved = await store.create(createInput);

  // 触发同步
  try {
    const trigger = deps.triggerSync ?? (await loadTriggerSync());
    trigger();
  } catch {
    // 同步失败不影响本地保存
  }

  return { saved };
}

// ──────────────────────────────────────────────────────────────
// 辅助
// ──────────────────────────────────────────────────────────────

/** 合并 PCM chunks 为单个 ArrayBuffer */
function defaultMergeChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/** 延迟加载 triggerSync，避免循环依赖 */
async function loadTriggerSync(): Promise<() => void> {
  const mod = await import("@/shared/lib/sync-orchestrator");
  return mod.triggerSync;
}

/**
 * 生成 guestBatchId（仅在 userId 为 null 时使用）。
 * 复用 crypto.randomUUID 或降级方案。
 */
export function generateGuestBatchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
