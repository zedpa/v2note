"use client";

import { useState, useRef, useCallback } from "react";
import { getPlatform } from "@/shared/lib/platform";
import { getHarmonyBridge } from "@/shared/lib/harmony-bridge";

export interface PCMRecorderCallbacks {
  onPCMData: (chunk: ArrayBuffer) => void;
  onError: (err: Error) => void;
}

/** base64 → ArrayBuffer */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function usePCMRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  // 鸿蒙模式：保存回调引用，停止时一次性发送全部 PCM
  const harmonyCallbacksRef = useRef<PCMRecorderCallbacks | null>(null);

  const startRecording = useCallback(async (callbacks: PCMRecorderCallbacks) => {
    if (activeRef.current) {
      console.log("[usePCMRecorder] Already active, skipping duplicate start");
      return;
    }
    activeRef.current = true;

    const platform = getPlatform();

    if (platform === "harmony") {
      try {
        const bridge = getHarmonyBridge();
        if (!bridge?.audio) throw new Error("Harmony audio bridge unavailable");

        const granted = await bridge.audio.requestPermission();
        if (!granted) throw new Error("Microphone permission denied");

        harmonyCallbacksRef.current = callbacks;
        await bridge.audio.startStream();

        setIsRecording(true);
        setDuration(0);
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
      } catch (err: any) {
        activeRef.current = false;
        harmonyCallbacksRef.current = null;
        callbacks.onError(new Error(`[harmony] ${err.message ?? "unknown"}`));
      }
      return;
    }

    // Web / Capacitor：使用 Web Audio API
    let step = "init";
    try {
      step = "getUserMedia";
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      step = "AudioContext";
      const ctx = new AudioContext({ sampleRate: 16000 });
      console.log(`[usePCMRecorder] AudioContext created. SampleRate: ${ctx.sampleRate}, State: ${ctx.state}`);
      contextRef.current = ctx;

      step = "addModule";
      await ctx.audioWorklet.addModule("/worklets/pcm-processor.js");

      step = "connect";
      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { sampleRate: ctx.sampleRate },
      });
      workletRef.current = worklet;

      worklet.port.onmessage = (event) => {
        if (event.data.byteLength > 0 && Math.random() < 0.01) {
           console.log(`[usePCMRecorder] Received chunk: ${event.data.byteLength} bytes`);
        }
        callbacks.onPCMData(event.data);
      };

      source.connect(worklet);
      worklet.connect(ctx.destination);

      setIsRecording(true);
      setDuration(0);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err: any) {
      activeRef.current = false;
      callbacks.onError(new Error(`[${step}] ${err.message ?? "unknown"}`));
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<number> => {
    activeRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    const platform = getPlatform();
    if (platform === "harmony") {
      // 鸿蒙：停止录音，然后分段获取 PCM 数据
      const callbacks = harmonyCallbacksRef.current;
      harmonyCallbacksRef.current = null;
      const bridge = getHarmonyBridge();
      if (bridge?.audio && callbacks) {
        try {
          const meta = await bridge.audio.stop();
          console.log(`[usePCMRecorder] Harmony stop: duration=${meta.duration}s, totalBytes=${meta.totalBytes}`);

          if (meta.totalBytes > 0) {
            // 分段获取 PCM 数据（每段 32KB）
            const SEGMENT_SIZE = 32768;
            let offset = 0;
            let chunksSent = 0;
            while (offset < meta.totalBytes) {
              const len = Math.min(SEGMENT_SIZE, meta.totalBytes - offset);
              const b64 = await bridge.audio.getData(offset, len);
              if (!b64) break;
              const pcm = base64ToArrayBuffer(b64);
              callbacks.onPCMData(pcm);
              offset += pcm.byteLength;
              chunksSent++;
            }
            console.log(`[usePCMRecorder] Harmony: sent ${offset} bytes in ${chunksSent} segments`);
          }
        } catch (err) {
          console.error("[usePCMRecorder] Harmony stop error:", err);
        }
      }
    } else {
      // Web cleanup
      if (workletRef.current) {
        workletRef.current.disconnect();
        workletRef.current = null;
      }
      if (contextRef.current) {
        contextRef.current.close().catch(() => {});
        contextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }

    setIsRecording(false);
    setDuration(0);

    return finalDuration;
  }, []);

  const cancelRecording = useCallback(() => {
    const platform = getPlatform();
    if (platform === "harmony") {
      harmonyCallbacksRef.current = null;
      const bridge = getHarmonyBridge();
      bridge?.audio?.cancel().catch(() => {});
    }
    stopRecording();
  }, [stopRecording]);

  return {
    isRecording,
    isActive: activeRef,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
