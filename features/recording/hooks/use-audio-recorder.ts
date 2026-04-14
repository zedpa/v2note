"use client";

import { useState, useRef, useCallback } from "react";
import { getPlatform } from "@/shared/lib/platform";
import { getHarmonyBridge } from "@/shared/lib/harmony-bridge";

export interface RecordingResult {
  base64: string;
  mimeType: string;
  duration: number;
}

export class RecordingUnsupportedError extends Error {
  constructor() {
    super("Recording is not supported in this environment");
    this.name = "RecordingUnsupportedError";
  }
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);

  /** 启动计时器 */
  const startTimer = useCallback(() => {
    setDuration(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  /** 停止计时器 */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ---- Harmony 录音 ----
  const startHarmony = useCallback(async () => {
    const bridge = getHarmonyBridge();
    if (!bridge?.audio) throw new Error("Harmony audio bridge unavailable");
    const granted = await bridge.audio.requestPermission();
    if (!granted) throw new Error("Microphone permission denied");
    // 清理残留录音状态
    try {
      const status = await bridge.audio.getStatus();
      if (status === "recording") await bridge.audio.stop();
    } catch { /* ignore */ }
    await bridge.audio.start();
  }, []);

  const stopHarmony = useCallback(async (): Promise<RecordingResult> => {
    const bridge = getHarmonyBridge();
    if (!bridge?.audio) throw new Error("Harmony audio bridge unavailable");
    const meta = await bridge.audio.stop();
    // 分段获取全部 PCM 数据（每段 32KB）
    const segments: string[] = [];
    const SEGMENT_SIZE = 32768;
    let offset = 0;
    while (offset < meta.totalBytes) {
      const len = Math.min(SEGMENT_SIZE, meta.totalBytes - offset);
      const b64 = await bridge.audio.getData(offset, len);
      if (!b64) break;
      segments.push(b64);
      // 用实际解码长度推进 offset，防止尾段不足 len 时多跳
      const actualBytes = Math.ceil(b64.length * 3 / 4);
      offset += actualBytes;
    }
    return {
      base64: segments.join(""),
      mimeType: "audio/pcm",
      duration: meta.duration,
    };
  }, []);

  // ---- Capacitor 录音（动态 import）----
  const startCapacitor = useCallback(async () => {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const status = await VoiceRecorder.hasAudioRecordingPermission();
    if (!status.value) {
      const result = await VoiceRecorder.requestAudioRecordingPermission();
      if (!result.value) throw new Error("Microphone permission denied");
    }
    // 清理残留录音状态
    try {
      const curStatus = await VoiceRecorder.getCurrentStatus();
      if (curStatus.status === "RECORDING") await VoiceRecorder.stopRecording();
    } catch { /* ignore */ }
    await VoiceRecorder.startRecording();
  }, []);

  const stopCapacitor = useCallback(async (): Promise<RecordingResult> => {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const result = await VoiceRecorder.stopRecording();
    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return {
      base64: result.value.recordDataBase64 ?? "",
      mimeType: result.value.mimeType ?? "audio/aac",
      duration: finalDuration,
    };
  }, []);

  /** 当前环境是否支持录音 */
  const isSupported = useCallback(() => {
    const p = getPlatform();
    return p === "harmony" || p === "capacitor";
  }, []);

  // ---- 统一入口 ----
  const startRecording = useCallback(async () => {
    const platform = getPlatform();

    if (platform === "harmony") {
      await startHarmony();
    } else if (platform === "capacitor") {
      await startCapacitor();
    } else {
      throw new RecordingUnsupportedError();
    }

    setIsRecording(true);
    startTimer();
  }, [startHarmony, startCapacitor, startTimer]);

  const stopRecording = useCallback(async (): Promise<RecordingResult> => {
    stopTimer();

    const platform = getPlatform();
    let result: RecordingResult;

    if (platform === "harmony") {
      result = await stopHarmony();
    } else if (platform === "capacitor") {
      result = await stopCapacitor();
    } else {
      throw new RecordingUnsupportedError();
    }

    setIsRecording(false);
    setDuration(0);
    return result;
  }, [stopTimer, stopHarmony, stopCapacitor]);

  const cancelRecording = useCallback(async () => {
    stopTimer();

    const platform = getPlatform();
    try {
      if (platform === "harmony") {
        const bridge = getHarmonyBridge();
        if (bridge?.audio) await bridge.audio.cancel();
      } else if (platform === "capacitor") {
        const { VoiceRecorder } = await import("capacitor-voice-recorder");
        await VoiceRecorder.stopRecording();
      }
    } catch {
      // ignore — may not be recording
    }

    setIsRecording(false);
    setDuration(0);
  }, [stopTimer]);

  return {
    isRecording,
    isSupported,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
