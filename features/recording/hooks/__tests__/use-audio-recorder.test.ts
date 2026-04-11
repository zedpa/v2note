import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("use-audio-recorder — 动态 import 改造", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__harmony_bridge__;
    delete (window as any).Capacitor;
  });

  it("should_use_harmony_bridge_audio_when_harmony_platform", async () => {
    const mockStart = vi.fn().mockResolvedValue(undefined);
    const mockStop = vi.fn().mockResolvedValue({
      base64: "aGVsbG8=",
      mimeType: "audio/aac",
      duration: 5,
    });
    const mockRequestPerm = vi.fn().mockResolvedValue(true);
    const mockGetStatus = vi.fn().mockResolvedValue("idle");

    (window as any).__harmony_bridge__ = {
      audio: {
        requestPermission: mockRequestPerm,
        start: mockStart,
        stop: mockStop,
        getStatus: mockGetStatus,
      },
    };

    const { useAudioRecorder } = await import("../use-audio-recorder");
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockRequestPerm).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(true);

    let recordingResult: any;
    await act(async () => {
      recordingResult = await result.current.stopRecording();
    });

    expect(mockStop).toHaveBeenCalled();
    expect(recordingResult.base64).toBe("aGVsbG8=");
    expect(result.current.isRecording).toBe(false);

    delete (window as any).__harmony_bridge__;
  });

  it("should_throw_when_harmony_permission_denied", async () => {
    const mockRequestPerm = vi.fn().mockResolvedValue(false);

    (window as any).__harmony_bridge__ = {
      audio: {
        requestPermission: mockRequestPerm,
        start: vi.fn(),
        stop: vi.fn(),
        getStatus: vi.fn().mockResolvedValue("idle"),
      },
    };

    const { useAudioRecorder } = await import("../use-audio-recorder");
    const { result } = renderHook(() => useAudioRecorder());

    await expect(
      act(async () => {
        await result.current.startRecording();
      }),
    ).rejects.toThrow("Microphone permission denied");

    delete (window as any).__harmony_bridge__;
  });

  it("should_throw_unsupported_error_when_web_platform", async () => {
    // 无 harmony bridge，无 Capacitor
    const { useAudioRecorder } = await import("../use-audio-recorder");
    const { result } = renderHook(() => useAudioRecorder());

    await expect(
      act(async () => {
        await result.current.startRecording();
      }),
    ).rejects.toThrow(/not supported|不支持/i);
  });

  it("should_use_capacitor_voice_recorder_when_capacitor_platform", async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };

    // Mock capacitor-voice-recorder 动态 import
    vi.doMock("capacitor-voice-recorder", () => ({
      VoiceRecorder: {
        hasAudioRecordingPermission: vi.fn().mockResolvedValue({ value: true }),
        requestAudioRecordingPermission: vi.fn().mockResolvedValue({ value: true }),
        getCurrentStatus: vi.fn().mockResolvedValue({ status: "NONE" }),
        startRecording: vi.fn().mockResolvedValue(undefined),
        stopRecording: vi.fn().mockResolvedValue({
          value: {
            recordDataBase64: "Y2FwYWNpdG9y",
            mimeType: "audio/aac",
          },
        }),
      },
    }));

    const { useAudioRecorder } = await import("../use-audio-recorder");
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.isRecording).toBe(true);

    let recordingResult: any;
    await act(async () => {
      recordingResult = await result.current.stopRecording();
    });
    expect(recordingResult.base64).toBe("Y2FwYWNpdG9y");
    expect(result.current.isRecording).toBe(false);

    delete (window as any).Capacitor;
  });

  it("should_cancel_recording_without_error_on_harmony", async () => {
    const mockStop = vi.fn().mockResolvedValue({
      base64: "",
      mimeType: "audio/aac",
      duration: 0,
    });

    (window as any).__harmony_bridge__ = {
      audio: {
        requestPermission: vi.fn().mockResolvedValue(true),
        start: vi.fn().mockResolvedValue(undefined),
        stop: mockStop,
        getStatus: vi.fn().mockResolvedValue("idle"),
      },
    };

    const { useAudioRecorder } = await import("../use-audio-recorder");
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      await result.current.cancelRecording();
    });

    expect(result.current.isRecording).toBe(false);
    delete (window as any).__harmony_bridge__;
  });
});
