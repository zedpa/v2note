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
  // Synchronous ref to prevent double recording (React state is async)
  const activeRef = useRef(false);

  const startRecording = useCallback(async (callbacks: PCMRecorderCallbacks) => {
    if (activeRef.current) {
      console.log("[usePCMRecorder] Already active, skipping duplicate start");
      return;
    }
    activeRef.current = true;
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
      // Try to use 16kHz context directly. If not supported, it will fall back to hardware rate
      const ctx = new AudioContext({ sampleRate: 16000 });
      console.log(`[usePCMRecorder] AudioContext created. SampleRate: ${ctx.sampleRate}, State: ${ctx.state}`);
      contextRef.current = ctx;

      // Step 3: Load worklet
      step = "addModule";
      await ctx.audioWorklet.addModule("/worklets/pcm-processor.js");

      // Step 4: Connect nodes
      step = "connect";
      const source = ctx.createMediaStreamSource(stream);
      // Pass actual sampleRate to worklet to handle downsampling if needed
      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { sampleRate: ctx.sampleRate },
      });
      workletRef.current = worklet;

      worklet.port.onmessage = (event) => {
        // Log first chunk for debug
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

  const stopRecording = useCallback((): number => {
    activeRef.current = false;
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
    isActive: activeRef,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
