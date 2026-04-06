import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock 依赖
const mockSendBinary = vi.fn();
const mockSend = vi.fn();
const mockConnect = vi.fn();
const mockWaitForReady = vi.fn().mockResolvedValue(true);
const mockOnMessage = vi.fn().mockReturnValue(vi.fn());
let mockConnected = true;

vi.mock("@/features/chat/lib/gateway-client", () => ({
  getGatewayClient: () => ({
    connected: mockConnected,
    connect: mockConnect,
    waitForReady: mockWaitForReady,
    send: mockSend,
    sendBinary: mockSendBinary,
    onMessage: mockOnMessage,
  }),
}));

const mockStartRecording = vi.fn().mockResolvedValue(undefined);
const mockStopRecording = vi.fn().mockReturnValue(5);
const mockCancelRecording = vi.fn();
let mockIsActive = { current: false };

vi.mock("@/features/recording/hooks/use-pcm-recorder", () => ({
  usePCMRecorder: () => ({
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    cancelRecording: mockCancelRecording,
    isActive: mockIsActive,
    isRecording: false,
    duration: 0,
  }),
}));

vi.mock("@/shared/lib/device", () => ({
  getDeviceId: vi.fn().mockResolvedValue("test-device-123"),
}));

describe("useVoiceToText", () => {
  let onTranscript: (text: string) => void;
  let onError: (msg: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnected = true;
    mockIsActive.current = false;
    mockWaitForReady.mockResolvedValue(true);
    onTranscript = vi.fn() as unknown as (text: string) => void;
    onError = vi.fn() as unknown as (msg: string) => void;
  });

  async function importAndRender() {
    const { useVoiceToText } = await import("./use-voice-to-text");
    return renderHook(() =>
      useVoiceToText({ onTranscript, onError, sourceContext: "chat" }),
    );
  }

  it("should_start_recording_when_gateway_connected", async () => {
    const { result } = await importAndRender();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.recording).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "asr.start",
        payload: expect.objectContaining({
          sourceContext: "chat",
        }),
      }),
    );
    expect(mockStartRecording).toHaveBeenCalled();
  });

  it("should_connect_gateway_when_not_connected", async () => {
    mockConnected = false;
    const { result } = await importAndRender();

    await act(async () => {
      await result.current.start();
    });

    expect(mockConnect).toHaveBeenCalled();
    expect(mockWaitForReady).toHaveBeenCalled();
  });

  it("should_error_when_gateway_unreachable", async () => {
    mockConnected = false;
    mockWaitForReady.mockResolvedValue(false);
    const { result } = await importAndRender();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.recording).toBe(false);
    expect(onError).toHaveBeenCalledWith("无法连接服务器，请检查网络");
  });

  it("should_stop_recording_and_send_asr_stop", async () => {
    const { result } = await importAndRender();

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockStopRecording).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "asr.stop",
        payload: expect.objectContaining({
          saveAudio: false,
          forceCommand: true,
        }),
      }),
    );
  });

  it("should_cancel_recording_and_send_asr_cancel", async () => {
    const { result } = await importAndRender();

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.cancel();
      // cancel 内部 getDeviceId 是 async，等一个 tick
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockCancelRecording).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "asr.cancel" }),
    );
    expect(result.current.recording).toBe(false);
  });

  it("should_not_start_recording_twice", async () => {
    const { result } = await importAndRender();

    // 第一次正常 start
    await act(async () => {
      await result.current.start();
    });

    const firstCallCount = mockStartRecording.mock.calls.length;

    // 第二次 start 时 recordingRef 已经 true（由第一次 start 设置）
    await act(async () => {
      await result.current.start();
    });

    // 不应该重复启动
    expect(mockStartRecording.mock.calls.length).toBe(firstCallCount);
  });
});
