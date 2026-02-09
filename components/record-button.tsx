"use client";

import React from "react"

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { uploadAudio } from "@/lib/upload";
import { processRecording } from "@/lib/process";
import { toast } from "sonner";

export function RecordButton() {
  const [phase, setPhase] = useState<
    "idle" | "pressing" | "recording" | "locked"
  >("idle");
  const [displayDuration, setDisplayDuration] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(16).fill(12));
  const [uploading, setUploading] = useState(false);

  const recorder = useAudioRecorder();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveRef = useRef<NodeJS.Timeout | null>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const startYRef = useRef(0);
  const isPressingRef = useRef(false);

  const SLIDE_THRESHOLD = 80;

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const startTimers = useCallback(() => {
    setDisplayDuration(0);
    timerRef.current = setInterval(() => setDisplayDuration((d) => d + 1), 1000);
    waveRef.current = setInterval(() => {
      setWaveHeights(
        Array(16)
          .fill(0)
          .map(() => Math.random() * 28 + 6),
      );
    }, 120);
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (waveRef.current) clearInterval(waveRef.current);
    timerRef.current = null;
    waveRef.current = null;
    setWaveHeights(Array(16).fill(12));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const result = await recorder.stopRecording();
      setUploading(true);
      toast("正在上传录音...");

      const uploaded = await uploadAudio(
        result.base64,
        result.mimeType,
        result.duration,
      );

      toast("录音上传成功，AI 正在处理...");

      // Process in background — don't await
      processRecording(uploaded.recordId, uploaded.audioUrl).then(() => {
        toast("AI 处理完成！");
      }).catch((err) => {
        toast.error(`处理失败: ${err.message}`);
      });
    } catch (err: any) {
      toast.error(`录音保存失败: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [recorder]);

  const reset = useCallback(() => {
    stopTimers();
    setPhase("idle");
    setDisplayDuration(0);
    setSlideOffset(0);
    isPressingRef.current = false;
    if (longPressRef.current) clearTimeout(longPressRef.current);
  }, [stopTimers]);

  const handleCancel = useCallback(async () => {
    stopTimers();
    await recorder.cancelRecording();
    setPhase("idle");
    setDisplayDuration(0);
    setSlideOffset(0);
    isPressingRef.current = false;
  }, [stopTimers, recorder]);

  // Handle touch/pointer start
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase === "locked" || uploading) return;
      isPressingRef.current = true;
      startYRef.current = e.clientY;
      setSlideOffset(0);
      setPhase("pressing");

      longPressRef.current = setTimeout(async () => {
        if (isPressingRef.current) {
          try {
            await recorder.startRecording();
            setPhase("recording");
            startTimers();
          } catch (err: any) {
            toast.error(`无法开始录音: ${err.message}`);
            setPhase("idle");
            isPressingRef.current = false;
          }
        }
      }, 300);
    },
    [phase, uploading, startTimers, recorder],
  );

  // Handle move for slide detection
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "recording") return;
      const delta = startYRef.current - e.clientY;
      const clamped = Math.max(0, Math.min(delta, 160));
      setSlideOffset(clamped);

      if (delta >= SLIDE_THRESHOLD) {
        setPhase("locked");
        setSlideOffset(0);
        isPressingRef.current = false;
      }
    },
    [phase],
  );

  // Handle release
  const handlePointerUp = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current);

    if (phase === "pressing") {
      setPhase("idle");
      isPressingRef.current = false;
      return;
    }

    if (phase === "recording") {
      // Released without sliding up — save & stop
      stopTimers();
      setPhase("idle");
      setDisplayDuration(0);
      setSlideOffset(0);
      handleSave();
    }

    isPressingRef.current = false;
  }, [phase, stopTimers, handleSave]);

  // Stop locked recording
  const handleStopLocked = useCallback(() => {
    stopTimers();
    setPhase("idle");
    setDisplayDuration(0);
    handleSave();
  }, [stopTimers, handleSave]);

  const handleCancelLocked = useCallback(() => {
    handleCancel();
  }, [handleCancel]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  // ---- Full screen locked recording ----
  if (phase === "locked") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-foreground/95 backdrop-blur-md">
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm text-background/60 font-medium">
                录音中
              </span>
            </div>

            {/* Waveform */}
            <div className="flex items-center gap-1 h-16">
              {waveHeights.map((h, i) => (
                <div
                  key={`lw-${i}-${Math.round(h)}`}
                  className="w-1 rounded-full bg-primary transition-all duration-100"
                  style={{ height: `${h}px`, opacity: 0.5 + (h / 34) * 0.5 }}
                />
              ))}
            </div>

            <p className="text-5xl font-extralight text-background tabular-nums tracking-widest">
              {formatDuration(displayDuration)}
            </p>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center gap-16 pb-16 mb-safe">
          <button
            type="button"
            onClick={handleCancelLocked}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-background/10 text-background/70 hover:bg-background/20 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <span className="text-[10px] text-background/40">取消</span>
          </button>

          <button
            type="button"
            onClick={handleStopLocked}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95">
              <Square className="w-7 h-7 fill-current" />
            </div>
            <span className="text-[10px] text-background/40">完成</span>
          </button>

          <div className="w-14" />
        </div>
      </div>
    );
  }

  // ---- Inline button (idle / pressing / recording) ----
  const isActive = phase === "recording" || phase === "pressing";
  const slideProgress = Math.min(slideOffset / SLIDE_THRESHOLD, 1);

  return (
    <div className="flex flex-col items-center relative">
      {/* Slide-up hint and recording UI */}
      {phase === "recording" && (
        <div
          className="absolute bottom-full mb-3 flex flex-col items-center gap-2 pointer-events-none select-none"
          style={{
            opacity: 1 - slideProgress * 0.4,
            transform: `translateY(${-slideOffset * 0.3}px)`,
          }}
        >
          <p className="text-3xl font-light text-foreground tabular-nums">
            {formatDuration(displayDuration)}
          </p>

          {/* Waveform mini */}
          <div className="flex items-center gap-0.5 h-8">
            {waveHeights.slice(0, 12).map((h, i) => (
              <div
                key={`mw-${i}-${Math.round(h)}`}
                className="w-0.5 rounded-full bg-primary transition-all duration-100"
                style={{
                  height: `${h * 0.6}px`,
                  opacity: 0.4 + (h / 34) * 0.6,
                }}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-1 animate-bounce">
            <ChevronUp className="w-5 h-5 text-primary" />
            <span className="text-xs text-primary font-medium">
              上滑保持录音
            </span>
          </div>
        </div>
      )}

      {/* Pressing hint */}
      {phase === "pressing" && (
        <div className="absolute bottom-full mb-4 flex flex-col items-center pointer-events-none select-none">
          <span className="text-xs text-muted-foreground">
            按住中...
          </span>
        </div>
      )}

      {/* Ring effects */}
      {isActive && (
        <>
          <span className="absolute inset-0 rounded-full bg-primary/15 animate-pulse-ring" />
          <span
            className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring"
            style={{ animationDelay: "0.5s" }}
          />
        </>
      )}

      {/* Main button */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        role="button"
        tabIndex={0}
        aria-label={uploading ? "上传中" : "长按开始录音"}
        className={cn(
          "relative flex items-center justify-center rounded-full select-none touch-none cursor-pointer",
          "transition-all duration-200",
          uploading && "opacity-60 pointer-events-none",
          isActive
            ? "w-[96px] h-[96px] bg-primary shadow-2xl shadow-primary/40 scale-110"
            : "w-[88px] h-[88px] bg-primary shadow-xl shadow-primary/30 hover:scale-105",
        )}
        style={
          phase === "recording"
            ? { transform: `scale(${1.1 + slideProgress * 0.15}) translateY(${-slideOffset * 0.15}px)` }
            : undefined
        }
      >
        {phase === "recording" ? (
          <div className="flex items-center gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={`bar-${i}`}
                className="w-1 rounded-full bg-primary-foreground animate-waveform"
                style={{
                  animationDelay: `${i * 0.12}s`,
                  height: "16px",
                }}
              />
            ))}
          </div>
        ) : uploading ? (
          <div className="w-6 h-6 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <Mic className="w-9 h-9 text-primary-foreground" />
        )}
      </div>

      {/* Label */}
      {!isActive && (
        <span className="text-[10px] font-medium mt-1 text-muted-foreground">
          {uploading ? "上传中..." : "长按录音"}
        </span>
      )}
    </div>
  );
}
