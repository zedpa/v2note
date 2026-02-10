"use client";

import { useState, useRef, useCallback } from "react";
import { VoiceRecorder } from "capacitor-voice-recorder";

export interface RecordingResult {
  base64: string;
  mimeType: string;
  duration: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);

  const ensurePermission = useCallback(async () => {
    const status = await VoiceRecorder.hasAudioRecordingPermission();
    if (!status.value) {
      const result = await VoiceRecorder.requestAudioRecordingPermission();
      if (!result.value) {
        throw new Error("Microphone permission denied");
      }
    }
  }, []);

  const startRecording = useCallback(async () => {
    await ensurePermission();
    // Clean up any stale recording state from the plugin
    try {
      const status = await VoiceRecorder.getCurrentStatus();
      if (status.status === "RECORDING") {
        await VoiceRecorder.stopRecording();
      }
    } catch {
      // ignore cleanup errors
    }
    await VoiceRecorder.startRecording();
    setIsRecording(true);
    setDuration(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, [ensurePermission]);

  const stopRecording = useCallback(async (): Promise<RecordingResult> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const result = await VoiceRecorder.stopRecording();
    setIsRecording(false);

    const finalDuration = Math.floor(
      (Date.now() - startTimeRef.current) / 1000,
    );
    setDuration(0);

    return {
      base64: result.value.recordDataBase64,
      mimeType: result.value.mimeType,
      duration: finalDuration,
    };
  }, []);

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await VoiceRecorder.stopRecording();
    } catch {
      // ignore — may not be recording
    }

    setIsRecording(false);
    setDuration(0);
  }, []);

  return {
    isRecording,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
