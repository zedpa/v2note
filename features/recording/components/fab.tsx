"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

interface FABProps {
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  onCommandDetected?: (command: string, args?: string[]) => void;
  onOpenCommandChat?: (initialText: string) => void;
  commandContext?: Partial<CommandContext>;
}

export function FAB({
  onStartReview,
  onCommandDetected,
  onOpenCommandChat,
  commandContext,
}: FABProps) {
  const [showTextSheet, setShowTextSheet] = useState(false);
  const [displayDuration, setDisplayDuration] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(24).fill(12));
  const [confirmedText, setConfirmedText] = useState("");
  const [partialText, setPartialText] = useState("");
  const [lockedPaused, setLockedPaused] = useState(false);

  const recorder = usePCMRecorder();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveRef = useRef<NodeJS.Timeout | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const volumeRef = useRef(0);
  const pausedRef = useRef(false);
  const commandReleaseRef = useRef(false);

  const startTimers = useCallback(() => {
    setDisplayDuration(0);

    timerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setDisplayDuration((d) => d + 1);
      }
    }, 1000);

    waveRef.current = setInterval(() => {
      const vol = pausedRef.current ? 0 : volumeRef.current;
      setWaveHeights(
        Array(24)
          .fill(0)
          .map(() => {
            const noise = Math.random() * 0.5 + 0.5;
            return Math.max(5, vol * 46 * noise + 7);
          }),
      );
    }, 100);
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (waveRef.current) clearInterval(waveRef.current);
    timerRef.current = null;
    waveRef.current = null;
    volumeRef.current = 0;
    setWaveHeights(Array(24).fill(12));
  }, []);

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
        case "asr.done": {
          if (commandReleaseRef.current) {
            commandReleaseRef.current = false;
            const transcript = (msg.payload.transcript || "").trim();
            setDisplayDuration(0);
            setConfirmedText("");
            setPartialText("");
            resetRef.current();
            onOpenCommandChat?.(transcript || "/");
            return;
          }

          if (msg.payload.recordId) {
            emit("recording:uploaded");
            emit("recording:processed");
          }
          break;
        }
        case "asr.error":
          toast.error(`识别错误: ${msg.payload.message}`);
          break;
        case "process.result":
          emit("recording:processed");
          break;
        case "command.detected":
          onCommandDetected?.(msg.payload.command, msg.payload.args);
          break;
      }
    });

    return () => unsub();
  }, [onCommandDetected, onOpenCommandChat]);

  const startRecording = useCallback(async () => {
    try {
      pausedRef.current = false;
      setLockedPaused(false);
      commandReleaseRef.current = false;

      const deviceId = await getDeviceId();
      const client = getGatewayClient();
      if (!client.connected) client.connect();

      client.send({ type: "asr.start", payload: { deviceId } });

      await recorder.startRecording({
        onPCMData: (chunk) => {
          if (pausedRef.current) return;

          client.sendBinary(chunk);
          const view = new Int16Array(chunk);
          let sum = 0;
          for (let i = 0; i < view.length; i++) {
            const v = view[i] / 32768;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / view.length);
          volumeRef.current = Math.min(1, rms * 5);
        },
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

  const finishRecording = useCallback(
    async (asCommand: boolean) => {
      stopTimers();
      pausedRef.current = false;
      setLockedPaused(false);

      try {
        recorder.stopRecording();
        const deviceId = await getDeviceId();
        const client = getGatewayClient();

        if (asCommand) {
          commandReleaseRef.current = true;
          client.send({ type: "asr.stop", payload: { deviceId, saveAudio: false } });
          toast("正在识别语音指令...");
        } else {
          commandReleaseRef.current = false;
          client.send({ type: "asr.stop", payload: { deviceId } });
          toast("正在处理录音...");
          setDisplayDuration(0);
          setConfirmedText("");
          setPartialText("");
        }
      } catch (err: any) {
        commandReleaseRef.current = false;
        toast.error(`录音结束失败: ${err.message}`);
      }
    },
    [recorder, stopTimers],
  );

  const cancelRecording = useCallback(async () => {
    stopTimers();
    pausedRef.current = false;
    setLockedPaused(false);
    commandReleaseRef.current = false;

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

  const gestures = useFabGestures({
    onTap: () => setShowTextSheet(true),
    onLongPressStart: () => startRecording(),
    onSwipeLeft: () => cancelRecording(),
    onSwipeRight: () => {
      // phase transitions to "locked" by gesture hook
    },
    onSwipeUp: () => finishRecording(true),
    onRelease: () => finishRecording(false),
  });

  const { phase, swipeDirection, swipeProgress, reset, handlers } = gestures;
  resetRef.current = reset;

  const toggleLockedPause = useCallback(() => {
    setLockedPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      if (next) {
        volumeRef.current = 0;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
    };
  }, []);

  const dragOverlayStyle = useMemo(() => {
    const intensity = Math.max(0, Math.min(1, swipeProgress));
    if (phase !== "recording" || swipeDirection === "none") return null;

    if (swipeDirection === "right") {
      const alpha = (0.12 + intensity * 0.42).toFixed(3);
      return {
        background: `linear-gradient(110deg, rgba(34,197,94,0) 30%, rgba(34,197,94,${alpha}) 100%)`,
      };
    }

    if (swipeDirection === "left") {
      const alpha = (0.12 + intensity * 0.42).toFixed(3);
      return {
        background: `linear-gradient(250deg, rgba(239,68,68,0) 30%, rgba(239,68,68,${alpha}) 100%)`,
      };
    }

    const alpha = (0.12 + intensity * 0.42).toFixed(3);
    return {
      background: `linear-gradient(180deg, rgba(251,146,60,${alpha}) 0%, rgba(251,146,60,0) 62%)`,
    };
  }, [phase, swipeDirection, swipeProgress]);

  const dragHint = useMemo(() => {
    if (swipeDirection === "right") return "松手进入常驻录音";
    if (swipeDirection === "up") return "松手发送语音指令";
    if (swipeDirection === "left") return "松手取消录音";
    return "松开发送";
  }, [swipeDirection]);

  if (phase === "locked") {
    return (
      <RecordingImmersive
        duration={displayDuration}
        waveHeights={waveHeights}
        confirmedText={confirmedText}
        partialText={partialText}
        paused={lockedPaused}
        onTogglePause={toggleLockedPause}
        onCancel={() => {
          cancelRecording();
          reset();
        }}
        onDone={() => {
          finishRecording(false);
          reset();
        }}
      />
    );
  }

  return (
    <>
      {phase === "recording" && (
        <div className="fixed inset-0 z-30 pointer-events-none">
          {dragOverlayStyle && <div className="absolute inset-0 transition-all duration-75" style={dragOverlayStyle} />}

          <div className="absolute bottom-[138px] left-0 right-0 flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center gap-[3px] h-8">
              {waveHeights.slice(0, 18).map((h, i) => (
                <div
                  key={i}
                  className="rounded-full bg-primary transition-all duration-100"
                  style={{
                    width: "3px",
                    height: `${Math.max(4, h * 0.45)}px`,
                    opacity: 0.35 + (h / 54) * 0.65,
                  }}
                />
              ))}
            </div>
            <span className="text-sm tabular-nums text-foreground/70">{formatDuration(displayDuration)}</span>
          </div>

          <div className="absolute top-24 left-0 right-0 flex justify-center">
            <span className="px-4 py-2 rounded-full bg-black/25 text-white/90 text-sm">{dragHint}</span>
          </div>

          <div className="absolute bottom-[26px] left-6 right-6 flex justify-between items-center">
            <span className="text-xs text-red-500/85 font-medium">← 取消</span>
            <span className="text-xs text-orange-400/90 font-medium">↑ 指令</span>
            <span className="text-xs text-emerald-500/90 font-medium">常驻 →</span>
          </div>
        </div>
      )}

      <div
        className="fixed bottom-[54px] left-1/2 z-40"
        style={{ transform: "translateX(-50%)" }}
      >
        {phase === "pressing" && (
          <>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-fab-ripple" />
            <div
              className="absolute inset-0 rounded-full bg-primary/15 animate-fab-ripple"
              style={{ animationDelay: "0.4s" }}
            />
          </>
        )}

        {phase === "recording" && (
          <div className="absolute -inset-1 rounded-full border-2 border-destructive/50 animate-pulse pointer-events-none" />
        )}

        <button
          type="button"
          {...handlers}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            handlers.onPointerDown(e);
          }}
          className={cn(
            "relative flex items-center justify-center w-16 h-16 rounded-full select-none touch-none transition-transform duration-200",
            "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
            phase === "pressing" && "scale-110",
            phase === "idle" && "animate-fab-breathe",
          )}
        >
          <Mic className="w-8 h-8" />
        </button>
      </div>

      <TextBottomSheet
        open={showTextSheet}
        onClose={() => setShowTextSheet(false)}
        onStartReview={onStartReview}
        onCommandMode={(text) => {
          setShowTextSheet(false);
          onOpenCommandChat?.(text);
        }}
        commandContext={commandContext}
      />
    </>
  );
}
