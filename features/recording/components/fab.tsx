"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePCMRecorder } from "@/features/recording/hooks/use-pcm-recorder";
import { useFabGestures } from "@/features/recording/hooks/use-fab-gestures";
import {
  getGatewayClient,
  type GatewayResponse,
} from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";
import { emit } from "@/features/recording/lib/events";
import { TextBottomSheet } from "./text-bottom-sheet";
import { RecordingImmersive } from "./recording-immersive";
import type { CommandContext } from "@/features/commands/lib/registry";
import { toast } from "sonner";

interface FABProps {
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  commandContext?: Partial<CommandContext>;
}

export function FAB({ onStartReview, commandContext }: FABProps) {
  const [showTextSheet, setShowTextSheet] = useState(false);
  const [displayDuration, setDisplayDuration] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(
    Array(24).fill(12),
  );
  const [confirmedText, setConfirmedText] = useState("");
  const [partialText, setPartialText] = useState("");

  const recorder = usePCMRecorder();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveRef = useRef<NodeJS.Timeout | null>(null);
  const resetRef = useRef<() => void>(() => {});

  // ── Timers ──

  const startTimers = useCallback(() => {
    setDisplayDuration(0);
    timerRef.current = setInterval(
      () => setDisplayDuration((d) => d + 1),
      1000,
    );
    waveRef.current = setInterval(() => {
      setWaveHeights(
        Array(24)
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
    setWaveHeights(Array(24).fill(12));
  }, []);

  // ── Gateway ASR listener ──

  useEffect(() => {
    const client = getGatewayClient();
    if (!client.connected) client.connect();

    const unsub = client.onMessage((msg: GatewayResponse) => {
      switch (msg.type) {
        case "asr.partial":
          setPartialText(msg.payload.text);
          break;
        case "asr.sentence":
          setConfirmedText((prev) => prev + msg.payload.text);
          setPartialText("");
          break;
        case "asr.done":
          if (msg.payload.recordId) {
            emit("recording:uploaded");
            emit("recording:processed");
          }
          break;
        case "asr.error":
          toast.error(`识别错误: ${msg.payload.message}`);
          break;
        case "process.result":
          emit("recording:processed");
          break;
      }
    });

    return () => unsub();
  }, []);

  // ── Recording actions ──

  const startRecording = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const client = getGatewayClient();
      if (!client.connected) client.connect();

      client.send({ type: "asr.start", payload: { deviceId } });

      await recorder.startRecording({
        onPCMData: (chunk) => client.sendBinary(chunk),
        onError: (err) => {
          toast.error(`录音错误: ${err.message}`);
          resetRef.current();
        },
      });

      setConfirmedText("");
      setPartialText("");
      startTimers();
    } catch (err: any) {
      const msg = err.message ?? "";
      if (msg.includes("fetch") || msg.includes("network")) {
        toast.error("无法连接服务器，请检查网络");
      } else {
        toast.error(`无法开始录音: ${msg}`);
      }
      stopTimers();
      resetRef.current();
    }
  }, [recorder, startTimers, stopTimers]);

  const saveRecording = useCallback(async () => {
    stopTimers();
    try {
      recorder.stopRecording();
      const deviceId = await getDeviceId();
      const client = getGatewayClient();
      client.send({ type: "asr.stop", payload: { deviceId } });
      toast("正在处理录音...");
    } catch (err: any) {
      toast.error(`录音保存失败: ${err.message}`);
    } finally {
      setDisplayDuration(0);
      setConfirmedText("");
      setPartialText("");
    }
  }, [recorder, stopTimers]);

  const cancelRecording = useCallback(async () => {
    stopTimers();
    recorder.cancelRecording();
    try {
      const deviceId = await getDeviceId();
      const client = getGatewayClient();
      client.send({ type: "asr.cancel", payload: { deviceId } });
    } catch {
      // ignore
    }
    setDisplayDuration(0);
    setConfirmedText("");
    setPartialText("");
  }, [stopTimers, recorder]);

  // ── Gesture hook ──

  const gestures = useFabGestures({
    onTap: () => setShowTextSheet(true),
    onLongPressStart: () => startRecording(),
    onSwipeLeft: () => cancelRecording(),
    onSwipeRight: () => {
      /* lock — phase becomes "locked" automatically */
    },
    onRelease: () => saveRecording(),
  });

  const { phase, swipeDirection, deltaX, reset, handlers } = gestures;
  resetRef.current = reset;

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
    };
  }, []);

  // ── Locked mode → immersive overlay ──

  if (phase === "locked") {
    return (
      <RecordingImmersive
        duration={displayDuration}
        waveHeights={waveHeights}
        confirmedText={confirmedText}
        partialText={partialText}
        onCancel={() => {
          cancelRecording();
          reset();
        }}
        onDone={() => {
          saveRecording();
          reset();
        }}
      />
    );
  }

  // ── Inline FAB ──

  const isRecording = phase === "recording";
  const fabTranslateX = isRecording ? deltaX : 0;

  return (
    <>
      {/* Recording mini-waveform above FAB */}
      {isRecording && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 animate-mood-shift">
          <div className="flex items-center justify-center gap-0.5 h-8">
            {waveHeights.slice(0, 12).map((h, i) => (
              <div
                key={i}
                className="w-0.5 rounded-full bg-primary transition-all duration-100"
                style={{
                  height: `${h * 0.6}px`,
                  opacity: 0.4 + (h / 34) * 0.6,
                }}
              />
            ))}
            <span className="ml-2 text-xs text-primary tabular-nums font-mono">
              {formatDuration(displayDuration)}
            </span>
          </div>

          {/* Realtime transcript preview */}
          {(confirmedText || partialText) && (
            <div className="max-w-[260px] text-center px-3 py-1.5 rounded-xl bg-card/90 shadow-sm backdrop-blur-sm">
              <span className="text-xs text-foreground/70">{confirmedText}</span>
              <span className="text-xs text-foreground/40">{partialText}</span>
            </div>
          )}

          {/* Swipe direction hints */}
          <div className="flex items-center gap-20">
            <span
              className={cn(
                "text-[10px] transition-opacity duration-150",
                swipeDirection === "left"
                  ? "text-destructive opacity-100"
                  : "text-muted-foreground/40 opacity-60",
              )}
            >
              ← 取消
            </span>
            <span
              className={cn(
                "text-[10px] transition-opacity duration-150",
                swipeDirection === "right"
                  ? "text-accent opacity-100"
                  : "text-muted-foreground/40 opacity-60",
              )}
            >
              锁定 →
            </span>
          </div>
        </div>
      )}

      {/* FAB button */}
      <div
        className="fixed bottom-6 left-1/2 z-40"
        style={{
          transform: `translateX(calc(-50% + ${fabTranslateX}px))`,
          transition: isRecording ? "none" : "transform 0.2s ease-out",
        }}
      >
        {/* Ripple rings (recording state) */}
        {isRecording && (
          <>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-fab-ripple" />
            <div
              className="absolute inset-0 rounded-full bg-primary/15 animate-fab-ripple"
              style={{ animationDelay: "0.4s" }}
            />
            <div
              className="absolute inset-0 rounded-full bg-primary/10 animate-fab-ripple"
              style={{ animationDelay: "0.8s" }}
            />
          </>
        )}

        <button
          type="button"
          {...handlers}
          onPointerLeave={handlers.onPointerUp}
          className={cn(
            "relative flex items-center justify-center w-14 h-14 rounded-full select-none touch-none transition-transform duration-200",
            "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
            phase === "pressing" && "scale-110",
            isRecording && "scale-110",
            phase === "idle" && "animate-fab-breathe",
          )}
        >
          {isRecording ? (
            // Mini waveform inside button
            <div className="flex items-center gap-[2px] h-5">
              {waveHeights.slice(0, 5).map((h, i) => (
                <div
                  key={i}
                  className="w-[2px] rounded-full bg-primary-foreground/80 transition-all duration-100"
                  style={{ height: `${Math.max(4, h * 0.5)}px` }}
                />
              ))}
            </div>
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Text Bottom Sheet */}
      <TextBottomSheet
        open={showTextSheet}
        onClose={() => setShowTextSheet(false)}
        onStartReview={onStartReview}
        commandContext={commandContext}
      />
    </>
  );
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
