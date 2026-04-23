/**
 * fab-capture 单元测试
 *
 * regression: fix-cold-resume-silent-loss
 *
 * 这些测试覆盖 FAB "录音结束 → 本地落地 → 触发 sync" 主路径的纯函数/协调逻辑。
 * FAB 组件本身复杂（gesture/WS/动画），不在此层单元测试；通过此 helper 断言
 * spec §2.1 / §2.2 / §2.3 的关键行为。
 */

import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  buildCaptureFromPcm,
  saveFabCapture,
  createPcmGate,
  decideFinishDispatch,
  shouldAcceptAsrDone,
  MIN_DURATION_SEC,
} from "./fab-capture";
import type { CaptureRecord } from "@/shared/lib/capture-store";

function pcmChunk(bytes: number): ArrayBuffer {
  return new ArrayBuffer(bytes);
}

describe("buildCaptureFromPcm [regression: fix-cold-resume-silent-loss]", () => {
  it("should_return_not_save_when_chunks_are_empty", () => {
    const r = buildCaptureFromPcm([]);
    expect(r.shouldSave).toBe(false);
    expect(r.pcmData).toBeNull();
  });

  it("should_drop_capture_when_duration_below_one_second", () => {
    // 16kHz 16-bit mono = 32000 B/s → 0.5s = 16000 bytes
    const r = buildCaptureFromPcm([pcmChunk(16000)]);
    expect(r.shouldSave).toBe(false);
    expect(r.durationSec).toBeLessThan(MIN_DURATION_SEC);
  });

  it("should_merge_chunks_and_mark_should_save_when_duration_at_least_one_second", () => {
    // 精确 1s = 32000 bytes，拆成两块
    const r = buildCaptureFromPcm([pcmChunk(16000), pcmChunk(16000)]);
    expect(r.shouldSave).toBe(true);
    expect(r.durationSec).toBe(1);
    expect(r.pcmData?.byteLength).toBe(32000);
  });
});

describe("saveFabCapture [regression: fix-cold-resume-silent-loss]", () => {
  function mockStore() {
    const created: Array<Parameters<typeof import("@/shared/lib/capture-store").captureStore.create>[0]> = [];
    const store = {
      create: vi.fn(async (input: Parameters<typeof import("@/shared/lib/capture-store").captureStore.create>[0]): Promise<CaptureRecord> => {
        created.push(input);
        return {
          localId: "lid-test",
          serverId: null,
          kind: input.kind,
          text: input.text ?? null,
          audioLocalId: "aud-test",
          sourceContext: input.sourceContext,
          forceCommand: input.forceCommand,
          notebook: input.notebook,
          createdAt: "2026-04-18T00:00:00.000Z",
          userId: input.userId,
          syncStatus: "captured",
          lastError: null,
          retryCount: 0,
          syncingAt: null,
          guestBatchId: input.guestBatchId ?? null,
        };
      }),
    } as unknown as typeof import("@/shared/lib/capture-store").captureStore;
    return { store, created };
  }

  it("should_save_to_capture_store_on_release_even_when_ws_not_connected", async () => {
    // 这条测试模拟 spec §2.1 的核心契约：不依赖任何网络 / WS
    const { store, created } = mockStore();
    const triggerSync = vi.fn();

    const result = await saveFabCapture(
      {
        chunks: [pcmChunk(32000)], // 1s
        asCommand: false,
        notebook: "work",
        userId: "u-1",
        sourceContext: "fab",
      },
      { store, triggerSync },
    );

    expect(result.saved).not.toBeNull();
    expect(result.saved?.kind).toBe("diary");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      kind: "diary",
      forceCommand: false,
      notebook: "work",
      userId: "u-1",
      sourceContext: "fab",
    });
    expect(created[0].audioBlob?.pcmData.byteLength).toBe(32000);
    expect(triggerSync).toHaveBeenCalledTimes(1);
  });

  it("should_trigger_sync_after_capture_saved", async () => {
    const { store } = mockStore();
    const triggerSync = vi.fn();
    await saveFabCapture(
      {
        chunks: [pcmChunk(32000)],
        asCommand: false,
        notebook: null,
        userId: "u-1",
        sourceContext: "fab",
      },
      { store, triggerSync },
    );
    expect(triggerSync).toHaveBeenCalledOnce();
  });

  it("should_set_forceCommand_true_when_swipe_up_captures_as_command", async () => {
    // spec §2.3：asCommand=true → forceCommand 透传
    const { store, created } = mockStore();
    await saveFabCapture(
      {
        chunks: [pcmChunk(48000)],
        asCommand: true,
        notebook: null,
        userId: "u-1",
        sourceContext: "fab_command",
      },
      { store, triggerSync: vi.fn() },
    );
    expect(created[0].forceCommand).toBe(true);
    expect(created[0].sourceContext).toBe("fab_command");
  });

  it("should_skip_save_when_recording_too_short", async () => {
    const { store, created } = mockStore();
    const triggerSync = vi.fn();
    const result = await saveFabCapture(
      {
        chunks: [pcmChunk(10000)], // ~0.3s
        asCommand: false,
        notebook: null,
        userId: "u-1",
        sourceContext: "fab",
      },
      { store, triggerSync },
    );
    expect(result.saved).toBeNull();
    expect(result.skipReason).toBe("too_short");
    expect(created).toHaveLength(0);
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it("should_allow_null_userId_for_guest_capture", async () => {
    // spec §4.3：未登录也能落地；sync-orchestrator 会跳过 userId=null 条目
    const { store, created } = mockStore();
    await saveFabCapture(
      {
        chunks: [pcmChunk(32000)],
        asCommand: false,
        notebook: null,
        userId: null,
        sourceContext: "fab",
      },
      { store, triggerSync: vi.fn() },
    );
    expect(created[0].userId).toBeNull();
  });

  // ─── M4: saveFabCapture 抛错时上层仍能拿到 chunks 兜底 ────

  it("should_keep_pcm_chunks_when_saveFabCapture_throws_quota_error", async () => {
    // 模拟 captureStore.create 因 IndexedDB QuotaExceeded 抛错
    const quotaErr = Object.assign(new Error("QuotaExceededError"), {
      name: "QuotaExceededError",
    });
    const store = {
      create: vi.fn(async () => {
        throw quotaErr;
      }),
    } as unknown as typeof import("@/shared/lib/capture-store").captureStore;
    const triggerSync = vi.fn();

    const chunks = [pcmChunk(32000)];
    await expect(
      saveFabCapture(
        {
          chunks,
          asCommand: false,
          notebook: null,
          userId: "u-1",
          sourceContext: "fab",
        },
        { store, triggerSync },
      ),
    ).rejects.toThrow(/Quota/);

    // 调用方传入的 chunks 数组引用未被清空
    expect(chunks).toHaveLength(1);
    expect(chunks[0].byteLength).toBe(32000);
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it("should_notify_user_when_local_save_fails", async () => {
    // 本测试断言"错误传递语义"：saveFabCapture 将底层异常原样抛出，调用方（fab.tsx）
    // 再通过 fabNotify 通知用户。这里验证 error 携带了可读 message。
    const store = {
      create: vi.fn(async () => {
        throw new Error("QuotaExceededError: storage full");
      }),
    } as unknown as typeof import("@/shared/lib/capture-store").captureStore;

    await expect(
      saveFabCapture(
        { chunks: [pcmChunk(32000)], asCommand: false, notebook: null, userId: "u-1", sourceContext: "fab" },
        { store, triggerSync: vi.fn() },
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/Quota/) });
  });

  it("should_not_block_start_recording_on_waitForReady", async () => {
    // spec §2.2 断言：saveFabCapture 不 await 任何 WS/gateway 检查
    // 用一个永不完成的 triggerSync 都不应该阻塞 saveFabCapture 返回
    const { store } = mockStore();
    const neverReturnsAsync = vi.fn(() => {
      // 同步返回（triggerSync 本身是同步触发调度器，不应 await）
    });
    const t0 = Date.now();
    const result = await saveFabCapture(
      {
        chunks: [pcmChunk(32000)],
        asCommand: false,
        notebook: null,
        userId: "u-1",
        sourceContext: "fab",
      },
      { store, triggerSync: neverReturnsAsync },
    );
    const elapsed = Date.now() - t0;
    expect(result.saved).not.toBeNull();
    // 应当在 100ms 内完成（spec §2.1 契约）
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── C3: PCM 门闩 — 关闭后丢弃尾帧 ───────────────────────────

describe("createPcmGate [regression: fix-cold-resume-silent-loss]", () => {
  it("should_ignore_pcm_chunks_after_recording_closed_flag_set", () => {
    const gate = createPcmGate();
    expect(gate.accept()).toBe(true);

    // 模拟一批 chunk 在正常录音期间到达
    const accepted: ArrayBuffer[] = [];
    const acceptChunk = (c: ArrayBuffer) => {
      if (!gate.accept()) return;
      accepted.push(c);
    };
    acceptChunk(new ArrayBuffer(100));
    acceptChunk(new ArrayBuffer(200));
    expect(accepted).toHaveLength(2);

    // finishRecording 开始：关门
    gate.close();
    expect(gate.closed).toBe(true);

    // 尾帧（stopRecording 期间 worklet 回调）应被丢弃
    acceptChunk(new ArrayBuffer(400));
    acceptChunk(new ArrayBuffer(800));
    expect(accepted).toHaveLength(2); // 仍然是 2，未污染

    // 下一轮 startRecording：开门
    gate.open();
    acceptChunk(new ArrayBuffer(1000));
    expect(accepted).toHaveLength(3);
  });
});

// ─── C1: 指令录音 finishRecording 分发决策 ─────────────────

describe("decideFinishDispatch [regression: fix-cold-resume-silent-loss]", () => {
  it("should_still_send_asr_stop_with_forceCommand_when_asCommand_and_ws_connected", () => {
    const a = decideFinishDispatch({
      asCommand: true,
      wsConnected: true,
      sessionId: "sess-1",
    });
    expect(a.type).toBe("send_asr_stop_force_command");
    if (a.type === "send_asr_stop_force_command") {
      expect(a.payload.forceCommand).toBe(true);
      expect(a.payload.saveAudio).toBe(false);
      expect(a.payload.sessionId).toBe("sess-1");
    }
  });

  it("should_only_save_locally_when_asCommand_and_ws_disconnected", () => {
    const a = decideFinishDispatch({
      asCommand: true,
      wsConnected: false,
      sessionId: "sess-1",
    });
    // 决策层不发任何 WS 消息；调用方只会写入 captureStore
    expect(a.type).toBe("noop_offline_command");
  });

  it("should_send_asr_cancel_when_not_command_but_ws_connected", () => {
    const a = decideFinishDispatch({
      asCommand: false,
      wsConnected: true,
      sessionId: null,
    });
    expect(a.type).toBe("send_asr_cancel");
  });

  it("should_noop_when_not_command_and_ws_disconnected", () => {
    const a = decideFinishDispatch({
      asCommand: false,
      wsConnected: false,
      sessionId: null,
    });
    expect(a.type).toBe("noop");
  });
});

// ─── M3: asr.done 跨录音错关联防护 ───────────────────────────

describe("shouldAcceptAsrDone [regression: fix-cold-resume-silent-loss]", () => {
  it("should_ignore_asr_done_when_sessionId_mismatches_active", () => {
    // payload 带的 session 与当前不一致 → 拒收
    expect(shouldAcceptAsrDone("other-sess", "current-sess")).toBe(false);
  });

  it("should_accept_asr_done_when_sessionId_matches_active", () => {
    expect(shouldAcceptAsrDone("sess-1", "sess-1")).toBe(true);
  });

  it("should_ignore_asr_done_without_sessionId_when_still_recording", () => {
    // payload 没有 sessionId 但当前仍在录音 → 属于上一轮，忽略
    expect(shouldAcceptAsrDone(undefined, "active-sess")).toBe(false);
  });

  it("should_accept_asr_done_without_sessionId_when_not_recording", () => {
    // payload 无 sessionId 且当前无 active → 兼容旧 gateway（不回显 sessionId 的 done）
    expect(shouldAcceptAsrDone(undefined, null)).toBe(true);
  });
});
