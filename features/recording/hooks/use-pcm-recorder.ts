"use client";

import { useState, useRef, useCallback } from "react";

export interface PCMRecorderCallbacks {
  onPCMData: (chunk: ArrayBuffer) => void;
  onError: (err: Error) => void;
}

export function usePCMRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async (callbacks: PCMRecorderCallbacks) => {
    let step = "init";
    try {
      // Step 1: Request microphone
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

      // Step 2: Create AudioContext
      step = "AudioContext";
      const ctx = new AudioContext({ sampleRate: 16000 });
      contextRef.current = ctx;

      // Step 3: Load worklet
      step = "addModule";
      await ctx.audioWorklet.addModule("/worklets/pcm-processor.js");

      // Step 4: Connect nodes
      step = "connect";
      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "pcm-processor");
      workletRef.current = worklet;

      worklet.port.onmessage = (event) => {
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
      callbacks.onError(new Error(`[${step}] ${err.message ?? "unknown"}`));
    }
  }, []);

  const stopRecording = useCallback((): number => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    // Disconnect and cleanup
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

    setIsRecording(false);
    setDuration(0);

    return finalDuration;
  }, []);

  const cancelRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return {
    isRecording,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
