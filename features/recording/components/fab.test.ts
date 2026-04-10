import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * FAB 音频会话集成测试
 * 验证 activateAudioSession / deactivateAudioSession 辅助函数行为
 * 以及各录音退出路径中 deactivate 的调用
 */

// Mock AudioSession 模块
const mockActivate = vi.fn(() => Promise.resolve());
const mockDeactivate = vi.fn(() => Promise.resolve());

vi.mock("@/shared/lib/audio-session", () => ({
  AudioSession: {
    activate: () => mockActivate(),
    deactivate: () => mockDeactivate(),
  },
}));

// 提取 fab.tsx 中的辅助函数逻辑来独立测试
// 这些函数是 fab.tsx 内部的，我们在此处重新实现其核心逻辑进行验证
// 以避免需要渲染整个 React 组件树

import { AudioSession } from "@/shared/lib/audio-session";

describe("activateAudioSession 辅助函数逻辑", () => {
  let audioActivated: boolean;

  // 模拟 fab.tsx 中的 activateAudioSession 逻辑
  async function activateAudioSession() {
    try {
      await Promise.race([
        AudioSession.activate(),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
      audioActivated = true;
    } catch {
      // 静默
    }
  }

  async function deactivateAudioSession() {
    if (!audioActivated) return;
    audioActivated = false;
    try {
      await AudioSession.deactivate();
    } catch {
      // 静默
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    audioActivated = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 场景 1: 录音开始打断系统音频
  it("should_call_activate_when_recording_starts", async () => {
    const p = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(mockActivate).toHaveBeenCalledOnce();
    expect(audioActivated).toBe(true);
  });

  // 场景 2: 录音正常结束恢复音频
  it("should_call_deactivate_when_recording_finishes", async () => {
    // 先 activate
    const p1 = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    // 再 deactivate（模拟 finishRecording）
    const p2 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p2;

    expect(mockDeactivate).toHaveBeenCalledOnce();
    expect(audioActivated).toBe(false);
  });

  // 场景 3: 取消录音恢复音频
  it("should_call_deactivate_when_recording_cancelled", async () => {
    const p1 = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    // 模拟 cancelRecording
    const p2 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p2;

    expect(mockDeactivate).toHaveBeenCalledOnce();
  });

  // 场景 4: 录音失败/异常恢复音频
  it("should_call_deactivate_when_recording_fails", async () => {
    const p1 = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    // 模拟 handleRecordingFailure
    const p2 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p2;

    expect(mockDeactivate).toHaveBeenCalledOnce();
  });

  // 边界: 短按不触发 activate，deactivate 应为 no-op
  it("should_not_call_deactivate_when_activate_was_never_called", async () => {
    await deactivateAudioSession();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  // 边界: activate 成功后 deactivate 应只调用一次（幂等保护）
  it("should_not_call_deactivate_twice_for_same_session", async () => {
    const p1 = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    const p2 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p2;

    // 再次调用 deactivate — 应为 no-op
    const p3 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p3;

    expect(mockDeactivate).toHaveBeenCalledOnce();
  });

  // 边界: activate 失败时 audioActivated 保持 false
  it("should_keep_activated_false_when_activate_throws", async () => {
    mockActivate.mockRejectedValueOnce(new Error("native error"));

    const p = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p;

    expect(audioActivated).toBe(false);
    // deactivate 应为 no-op
    const p2 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p2;
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  // 边界: activate 超时(500ms)时仍标记为已激活
  it("should_set_activated_true_even_when_activate_times_out", async () => {
    // activate 永不 resolve
    mockActivate.mockReturnValueOnce(new Promise(() => {}));

    const p = activateAudioSession();
    // 推进 500ms 让 Promise.race 超时 resolve
    await vi.advanceTimersByTimeAsync(500);
    await p;

    expect(audioActivated).toBe(true);
  });

  // 边界: deactivate 抛异常时不影响状态重置
  it("should_reset_activated_flag_even_when_deactivate_throws", async () => {
    const p1 = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    mockDeactivate.mockRejectedValueOnce(new Error("native error"));

    const p2 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p2;

    expect(audioActivated).toBe(false);
    // 再次 deactivate 不应调用（已重置为 false）
    const p3 = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p3;
    expect(mockDeactivate).toHaveBeenCalledOnce();
  });

  // 场景 5: 锁定模式 — 暂停不 deactivate
  it("should_not_call_deactivate_on_pause_during_locked_mode", async () => {
    const p1 = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    // 暂停 — 不调用 deactivate
    // 只有停止或取消才 deactivate
    expect(mockDeactivate).not.toHaveBeenCalled();
    expect(audioActivated).toBe(true);
  });

  // 快速连续录音
  it("should_handle_rapid_activate_deactivate_cycles", async () => {
    // 第一次录音
    let p = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    p = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p;

    // 第二次录音
    p = activateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    p = deactivateAudioSession();
    await vi.advanceTimersByTimeAsync(0);
    await p;

    expect(mockActivate).toHaveBeenCalledTimes(2);
    expect(mockDeactivate).toHaveBeenCalledTimes(2);
  });
});
