/**
 * quick-capture 单元测试
 *
 * Spec #131 Phase A: 极简捕获页核心逻辑
 */

import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  saveTextCapture,
  saveVoiceCapture,
  generateGuestBatchId,
  MAX_RECORDING_DURATION_SEC,
  SILENCE_TIMEOUT_SEC,
  SUCCESS_ANIMATION_MS,
  MIN_VOICE_DURATION_SEC,
} from "./quick-capture";
import type { CaptureRecord, CaptureCreateInput } from "@/shared/lib/capture-store";

/** 生成指定字节数的 PCM chunk */
function pcmChunk(bytes: number): ArrayBuffer {
  return new ArrayBuffer(bytes);
}

/** 16kHz 16-bit mono → 每秒 32000 字节 */
const BYTES_PER_SECOND = 16000 * 2;

function mockStore() {
  const created: CaptureCreateInput[] = [];
  const store = {
    create: vi.fn(async (input: CaptureCreateInput): Promise<CaptureRecord> => {
      created.push(input);
      return {
        localId: "test-local-id",
        serverId: null,
        kind: input.kind,
        text: input.text ?? null,
        audioLocalId: null,
        sourceContext: input.sourceContext,
        forceCommand: input.forceCommand,
        notebook: input.notebook,
        createdAt: new Date().toISOString(),
        userId: input.userId,
        syncStatus: "captured",
        lastError: null,
        retryCount: 0,
        syncingAt: null,
        guestBatchId: input.guestBatchId ?? null,
      };
    }),
    update: vi.fn(),
    get: vi.fn(),
    listUnsynced: vi.fn(),
    listByKind: vi.fn(),
    listByGuestBatch: vi.fn(),
    delete: vi.fn(),
    getAudioBlob: vi.fn(),
    runStartupGC: vi.fn(),
    retryCapture: vi.fn(),
  };
  return { store, created };
}

describe("saveTextCapture", () => {
  // 场景 A1.3: 文字输入 → 内容写入 capture-store
  it("should_save_text_to_capture_store_when_text_is_valid", async () => {
    const { store, created } = mockStore();
    const triggerSync = vi.fn();

    const result = await saveTextCapture(
      {
        text: "明天下午开会",
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store, triggerSync },
    );

    expect(result.saved).not.toBeNull();
    expect(result.error).toBeUndefined();
    expect(created[0].text).toBe("明天下午开会");
    expect(created[0].kind).toBe("diary");
    expect(created[0].sourceContext).toBe("notification_capture");
    expect(created[0].forceCommand).toBe(false);
    expect(triggerSync).toHaveBeenCalledOnce();
  });

  // 边界条件：空文字不允许发送
  it("should_reject_empty_text_when_input_is_blank", async () => {
    const { store } = mockStore();
    const triggerSync = vi.fn();

    const result = await saveTextCapture(
      {
        text: "",
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store, triggerSync },
    );

    expect(result.saved).toBeNull();
    expect(result.error).toBe("empty_text");
    expect(store.create).not.toHaveBeenCalled();
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it("should_reject_whitespace_only_text", async () => {
    const { store } = mockStore();

    const result = await saveTextCapture(
      {
        text: "   \n\t  ",
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store },
    );

    expect(result.saved).toBeNull();
    expect(result.error).toBe("empty_text");
  });

  it("should_trim_text_before_saving", async () => {
    const { store, created } = mockStore();

    await saveTextCapture(
      {
        text: "  买牛奶  ",
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store },
    );

    expect(created[0].text).toBe("买牛奶");
  });

  // 场景 8.2: 未登录时的捕获
  it("should_save_with_null_userId_and_guestBatchId_when_not_logged_in", async () => {
    const { store, created } = mockStore();

    const result = await saveTextCapture(
      {
        text: "some thought",
        sourceContext: "notification_capture",
        userId: null,
        guestBatchId: "guest-batch-123",
      },
      { store },
    );

    expect(result.saved).not.toBeNull();
    expect(created[0].userId).toBeNull();
    expect(created[0].guestBatchId).toBe("guest-batch-123");
  });

  // sourceContext 由输入决定
  it("should_use_provided_sourceContext", async () => {
    const { store, created } = mockStore();

    await saveTextCapture(
      {
        text: "test",
        sourceContext: "ios_shortcut",
        userId: "user-1",
      },
      { store },
    );

    expect(created[0].sourceContext).toBe("ios_shortcut");
  });

  // 已登录时 guestBatchId 必须为 null
  it("should_set_guestBatchId_to_null_when_userId_is_present", async () => {
    const { store, created } = mockStore();

    await saveTextCapture(
      {
        text: "test",
        sourceContext: "notification_capture",
        userId: "user-1",
        guestBatchId: "should-be-ignored",
      },
      { store },
    );

    expect(created[0].guestBatchId).toBeNull();
  });
});

describe("saveVoiceCapture", () => {
  // 场景 A2.2: 手动结束录音 → 音频写入 capture-store
  it("should_save_voice_to_capture_store_when_chunks_are_valid", async () => {
    const { store, created } = mockStore();
    const triggerSync = vi.fn();
    const mergeChunks = vi.fn((chunks: ArrayBuffer[]) => {
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      return new ArrayBuffer(total);
    });

    // 2 秒录音 = 64000 bytes
    const result = await saveVoiceCapture(
      {
        chunks: [pcmChunk(32000), pcmChunk(32000)],
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store, triggerSync, mergeChunks },
    );

    expect(result.saved).not.toBeNull();
    expect(result.error).toBeUndefined();
    expect(created[0].kind).toBe("diary");
    expect(created[0].sourceContext).toBe("notification_capture");
    expect(created[0].audioBlob).toBeDefined();
    expect(created[0].audioBlob!.duration).toBe(2); // 2 秒
    expect(triggerSync).toHaveBeenCalledOnce();
  });

  // 边界条件：空 chunks
  it("should_reject_when_chunks_are_empty", async () => {
    const { store } = mockStore();

    const result = await saveVoiceCapture(
      {
        chunks: [],
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store },
    );

    expect(result.saved).toBeNull();
    expect(result.error).toBe("no_data");
    expect(store.create).not.toHaveBeenCalled();
  });

  // 边界条件：录音太短（< 1s）
  it("should_reject_when_duration_below_minimum", async () => {
    const { store } = mockStore();

    // 0.5 秒 = 16000 bytes
    const result = await saveVoiceCapture(
      {
        chunks: [pcmChunk(16000)],
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store },
    );

    expect(result.saved).toBeNull();
    expect(result.error).toBe("too_short");
  });

  // 边界条件：精确 1 秒 → 应该保存
  it("should_save_when_duration_is_exactly_minimum", async () => {
    const { store } = mockStore();
    const mergeChunks = vi.fn(() => new ArrayBuffer(BYTES_PER_SECOND));

    const result = await saveVoiceCapture(
      {
        chunks: [pcmChunk(BYTES_PER_SECOND)],
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store, mergeChunks },
    );

    expect(result.saved).not.toBeNull();
  });

  // 场景 8.2: 未登录时的捕获
  it("should_save_with_guestBatchId_when_not_logged_in", async () => {
    const { store, created } = mockStore();
    const mergeChunks = vi.fn(() => new ArrayBuffer(BYTES_PER_SECOND * 2));

    await saveVoiceCapture(
      {
        chunks: [pcmChunk(BYTES_PER_SECOND * 2)],
        sourceContext: "notification_capture",
        userId: null,
        guestBatchId: "guest-batch-456",
      },
      { store, mergeChunks },
    );

    expect(created[0].userId).toBeNull();
    expect(created[0].guestBatchId).toBe("guest-batch-456");
  });

  // syncStatus 为 captured
  it("should_set_syncStatus_to_captured", async () => {
    const { store } = mockStore();
    const mergeChunks = vi.fn(() => new ArrayBuffer(BYTES_PER_SECOND * 2));

    const result = await saveVoiceCapture(
      {
        chunks: [pcmChunk(BYTES_PER_SECOND * 2)],
        sourceContext: "notification_capture",
        userId: "user-1",
      },
      { store, mergeChunks },
    );

    expect(result.saved!.syncStatus).toBe("captured");
  });
});

describe("constants", () => {
  // 场景 A2.3b: 录音时长上限 5 分钟
  it("should_have_max_recording_duration_of_5_minutes", () => {
    expect(MAX_RECORDING_DURATION_SEC).toBe(300);
  });

  // 静音自动结束：连续 5 秒
  it("should_have_silence_timeout_of_5_seconds", () => {
    expect(SILENCE_TIMEOUT_SEC).toBe(5);
  });

  // 完成动画 1 秒
  it("should_have_success_animation_of_1_second", () => {
    expect(SUCCESS_ANIMATION_MS).toBe(1000);
  });

  // 最短录音时长
  it("should_have_min_voice_duration_of_1_second", () => {
    expect(MIN_VOICE_DURATION_SEC).toBe(1);
  });
});

describe("generateGuestBatchId", () => {
  // 场景 8.2: guestBatchId 自动生成
  it("should_generate_non_empty_string", () => {
    const id = generateGuestBatchId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("should_generate_unique_ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateGuestBatchId()));
    expect(ids.size).toBe(100);
  });
});
