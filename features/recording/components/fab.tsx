"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Mic, X, Command, Lock, Send, Sparkles, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePCMRecorder } from "@/features/recording/hooks/use-pcm-recorder";
import { useFabGestures } from "@/features/recording/hooks/use-fab-gestures";
import {
  getGatewayClient,
  type GatewayResponse,
} from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";
import { emit } from "@/features/recording/lib/events";
import { getSettings } from "@/shared/lib/local-config";
import { TextBottomSheet } from "./text-bottom-sheet";
import { RecordingImmersive } from "./recording-immersive";
import type { CommandContext } from "@/features/commands/lib/registry";
import { fabNotify, onFabNotify, type FabNotification } from "@/shared/lib/fab-notify";
import { startAiPipeline, renewAiPipeline, endAiPipeline } from "@/shared/lib/ai-processing";

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

const WITTY_PROCESSING = [
  "正在向宇宙发送电波…",
  "正在翻译你的脑电波…",
  "让我想想你说了啥…",
  "收到！正在解码中…",
  "正在和云端的小伙伴商量…",
];

interface FABProps {
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  onCommandDetected?: (command: string, args?: string[]) => void;
  onOpenCommandChat?: (initialText: string) => void;
  onOpenSkillChat?: (skillName: string) => void;
  commandContext?: Partial<CommandContext>;
  activeNotebook?: string | null;
  sourceContext?: "todo" | "timeline" | "chat" | "review";
}

export function FAB({
  onStartReview,
  onCommandDetected,
  onOpenCommandChat,
  onOpenSkillChat,
  commandContext,
  activeNotebook,
  sourceContext = "timeline",
}: FABProps) {
  const [showTextSheet, setShowTextSheet] = useState(false);
  const [displayDuration, setDisplayDuration] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(32).fill(8));
  const [confirmedText, setConfirmedText] = useState("");
  const [partialText, setPartialText] = useState("");
  const [lockedPaused, setLockedPaused] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wittyText, setWittyText] = useState("");
  const [capsuleNotify, setCapsuleNotify] = useState<FabNotification | null>(null);
  const capsuleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pipelineIdRef = useRef<string | null>(null);

  const recorder = usePCMRecorder();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveRef = useRef<NodeJS.Timeout | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const volumeRef = useRef(0);
  const pausedRef = useRef(false);
  const commandReleaseRef = useRef(false);

  const preBufferRef = useRef<ArrayBuffer[]>([]);
  const streamingRef = useRef(false);
  const preCaptureAbortRef = useRef(false);
  const activeNotebookRef = useRef(activeNotebook);
  activeNotebookRef.current = activeNotebook;
  const sourceContextRef = useRef(sourceContext);
  sourceContextRef.current = sourceContext;
  const gwClientRef = useRef<ReturnType<typeof getGatewayClient> | null>(null);

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
        Array(32)
          .fill(0)
          .map(() => {
            const noise = Math.random() * 0.5 + 0.5;
            return Math.max(4, vol * 60 * noise + 6);
          }),
      );
    }, 80);
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (waveRef.current) clearInterval(waveRef.current);
    timerRef.current = null;
    waveRef.current = null;
    volumeRef.current = 0;
    setWaveHeights(Array(32).fill(8));
  }, []);

  // 监听全局 fabNotify 事件，显示胶囊通知
  useEffect(() => {
    return onFabNotify((n) => {
      if (capsuleTimerRef.current) clearTimeout(capsuleTimerRef.current);
      setCapsuleNotify(n);
      capsuleTimerRef.current = setTimeout(() => {
        setCapsuleNotify(null);
        capsuleTimerRef.current = null;
      }, n.duration ?? 2000);
    });
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
            setDisplayDuration(0);
            setConfirmedText("");
            setPartialText("");
            resetRef.current();
            // 统一走 CommandSheet 弹窗：通过自定义事件通知 page.tsx
            window.dispatchEvent(new CustomEvent("v2note:forceCommand", {
              detail: { transcript: (msg.payload.transcript || "").trim() },
            }));
            return;
          }

          if (msg.payload.recordId) {
            emit("recording:uploaded");
            // Show processing capsule
            setProcessing(true);
            setWittyText(
              WITTY_PROCESSING[
                Math.floor(Math.random() * WITTY_PROCESSING.length)
              ],
            );
            // 全局管道状态：开始
            pipelineIdRef.current = startAiPipeline();
          }
          break;
        }
        case "asr.error":
          fabNotify.error(`识别错误: ${msg.payload.message}`);
          stopTimers();
          setDisplayDuration(0);
          setConfirmedText("");
          setPartialText("");
          pausedRef.current = false;
          setLockedPaused(false);
          commandReleaseRef.current = false;
          setProcessing(false);
          setWittyText("");
          resetRef.current();
          if (pipelineIdRef.current) { endAiPipeline(pipelineIdRef.current); pipelineIdRef.current = null; }
          break;
        case "process.result":
          emit("recording:processed");
          fabNotify.success("处理完成");
          setProcessing(false);
          setWittyText("");
          // 全局管道：续期（digest + todo 投影还在跑）
          if (pipelineIdRef.current) renewAiPipeline(pipelineIdRef.current);
          break;
        case "todo.created":
          emit("recording:processed");
          // 全局管道：终态
          if (pipelineIdRef.current) { endAiPipeline(pipelineIdRef.current); pipelineIdRef.current = null; }
          break;
        case "error":
          setProcessing((was) => {
            if (was) fabNotify.error("处理失败");
            return false;
          });
          setWittyText("");
          if (pipelineIdRef.current) { endAiPipeline(pipelineIdRef.current); pipelineIdRef.current = null; }
          break;
        case "command.detected":
          onCommandDetected?.(msg.payload.command, msg.payload.args);
          break;
      }
    });

    return () => unsub();
  }, [onCommandDetected, onOpenCommandChat, stopTimers]);

  // Safety timeout: auto-reset processing capsule after 30s
  useEffect(() => {
    if (!processing) return;
    const timer = setTimeout(() => {
      setProcessing(false);
      setWittyText("");
    }, 30000);
    return () => clearTimeout(timer);
  }, [processing]);

  const asrModeRef = useRef<"realtime" | "upload">("realtime");

  const startPreCapture = useCallback(async () => {
    preBufferRef.current = [];
    streamingRef.current = false;
    preCaptureAbortRef.current = false;
    gwClientRef.current = null;

    try {
      await recorder.startRecording({
        onPCMData: (chunk) => {
          if (pausedRef.current) return;

          if (!streamingRef.current) {
            preBufferRef.current.push(chunk.slice(0));
          } else {
            gwClientRef.current?.sendBinary(chunk);
            const view = new Int16Array(chunk);
            let sum = 0;
            for (let i = 0; i < view.length; i++) {
              const v = view[i] / 32768;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / view.length);
            volumeRef.current = Math.min(1, rms * 5);
          }
        },
        onError: (err) => {
          fabNotify.error(`录音错误: ${err.message}`);
          resetRef.current();
        },
      });

      if (preCaptureAbortRef.current) {
        recorder.cancelRecording();
        preBufferRef.current = [];
      }
    } catch {
      // Mic permission denied
    }
  }, [recorder]);

  const stopPreCapture = useCallback(() => {
    preCaptureAbortRef.current = true;
    if (recorder.isActive.current) {
      recorder.cancelRecording();
    }
    preBufferRef.current = [];
    streamingRef.current = false;
    gwClientRef.current = null;
  }, [recorder]);

  const startRecording = useCallback(async () => {
    try {
      pausedRef.current = false;
      setLockedPaused(false);
      commandReleaseRef.current = false;

      const [deviceId, settings] = await Promise.all([getDeviceId(), getSettings()]);
      const asrMode = settings.asrMode ?? "realtime";
      asrModeRef.current = asrMode;

      const client = getGatewayClient();
      if (!client.connected) {
        client.connect();
        const ready = await client.waitForReady();
        if (!ready) {
          fabNotify.error("无法连接服务器，请检查网络");
          stopPreCapture();
          return;
        }
      }
      gwClientRef.current = client;

      client.send({ type: "asr.start", payload: { deviceId, mode: asrMode, notebook: activeNotebookRef.current ?? undefined, sourceContext: sourceContextRef.current } });

      for (const chunk of preBufferRef.current) {
        client.sendBinary(chunk);
      }
      preBufferRef.current = [];
      streamingRef.current = true;

      if (!recorder.isActive.current) {
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
            fabNotify.error(`录音错误: ${err.message}`);
            resetRef.current();
          },
        });
      }

      setConfirmedText("");
      setPartialText("");
      startTimers();
    } catch (err: any) {
      const msg = err.message ?? "";
      if (msg.includes("fetch") || msg.includes("network")) {
        fabNotify.error("无法连接服务器，请检查网络");
      } else {
        fabNotify.error(`无法开始录音: ${msg}`);
      }
      stopTimers();
      stopPreCapture();
      resetRef.current();
    }
  }, [recorder, startTimers, stopTimers, stopPreCapture]);

  const finishRecording = useCallback(
    async (asCommand: boolean) => {
      stopTimers();
      pausedRef.current = false;
      setLockedPaused(false);
      streamingRef.current = false;
      preBufferRef.current = [];
      gwClientRef.current = null;

      try {
        recorder.stopRecording();
        const deviceId = await getDeviceId();
        const client = getGatewayClient();

        if (asCommand) {
          commandReleaseRef.current = true;
          client.send({ type: "asr.stop", payload: { deviceId, saveAudio: false, forceCommand: true } });
        } else {
          commandReleaseRef.current = false;
          client.send({ type: "asr.stop", payload: { deviceId } });
          setDisplayDuration(0);
          setConfirmedText("");
          setPartialText("");
        }
      } catch (err: any) {
        commandReleaseRef.current = false;
        fabNotify.error(`录音结束失败: ${err.message}`);
      }
    },
    [recorder, stopTimers],
  );

  const cancelRecording = useCallback(async () => {
    stopTimers();
    pausedRef.current = false;
    setLockedPaused(false);
    commandReleaseRef.current = false;
    streamingRef.current = false;
    preBufferRef.current = [];
    gwClientRef.current = null;

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

  const fabRef = useRef<HTMLButtonElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const gestures = useFabGestures({
    onTap: () => {
      stopPreCapture();
    },
    onLongPressStart: () => {
      longPressTriggeredRef.current = true;
      if (fabRef.current && pointerIdRef.current !== null) {
        try { fabRef.current.setPointerCapture(pointerIdRef.current); } catch {}
      }
      startRecording();
    },
    onSwipeLeft: () => cancelRecording(),
    onSwipeRight: () => {
      // phase transitions to "locked" by gesture hook
    },
    onSwipeUp: () => finishRecording(true), // v2: 上滑 = 指令模式，发送 forceCommand=true
    onRelease: () => finishRecording(false),
  });

  const { phase, swipeDirection, swipeProgress, deltaX, deltaY, reset, handlers } = gestures;
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
    if (phase === "idle" && !streamingRef.current && recorder.isActive.current) {
      stopPreCapture();
    }
  }, [phase, recorder.isActive, stopPreCapture]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
    };
  }, []);

  // ─── Swipe-aware visual state ───
  const activeDirection = swipeDirection;
  const progress = swipeProgress;

  // FAB follows finger with elastic damping
  const fabOffsetX = phase === "recording" ? deltaX * 0.35 : 0;
  const fabOffsetY = phase === "recording" ? Math.min(0, -deltaY * 0.35) : 0;

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
      {/* ─── RECORDING: Full-screen immersive backdrop ─── */}
      {phase === "recording" && (
        <div
          className="fixed inset-0 z-30 pointer-events-none select-none"
          style={{ top: "calc(44px + env(safe-area-inset-top, 0px))" }}
        >
          {/* Dark theater backdrop */}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              background: "radial-gradient(ellipse 120% 100% at 50% 100%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.95) 100%)",
            }}
          />

          {/* Colored glow based on swipe direction */}
          <div
            className="absolute inset-0 transition-all duration-200"
            style={{
              background:
                activeDirection === "left"
                  ? `radial-gradient(circle at ${30 - progress * 15}% 75%, rgba(239,68,68,${0.15 + progress * 0.2}) 0%, transparent 55%)`
                  : activeDirection === "up"
                    ? `radial-gradient(circle at 50% ${45 - progress * 20}%, rgba(245,158,11,${0.15 + progress * 0.2}) 0%, transparent 55%)`
                    : activeDirection === "right"
                      ? `radial-gradient(circle at ${70 + progress * 15}% 75%, rgba(16,185,129,${0.15 + progress * 0.2}) 0%, transparent 55%)`
                      : "radial-gradient(circle at 50% 85%, rgba(249,115,22,0.12) 0%, transparent 50%)",
            }}
          />

          {/* ─── TOP: Timer + status ─── */}
          <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-8">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <span className="text-[13px] tracking-[0.2em] text-white/50 uppercase font-medium">录音中</span>
            </div>
            <p className="text-5xl font-mono font-extralight text-white/90 tabular-nums tracking-[0.15em]">
              {formatDuration(displayDuration)}
            </p>
          </div>

          {/* ─── CENTER: Large waveform ─── */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 flex items-center justify-center">
            <div className="flex items-center justify-center gap-[4px] h-28 w-full max-w-sm">
              {waveHeights.map((h, i) => {
                const centerDist = Math.abs(i - 15.5) / 15.5;
                const falloff = 1 - centerDist * 0.4;
                const finalH = Math.max(4, h * falloff * 1.8);
                return (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-[80ms]"
                    style={{
                      width: "4px",
                      height: `${finalH}px`,
                      backgroundColor:
                        activeDirection === "left"
                          ? `rgba(239,68,68,${0.4 + (finalH / 100) * 0.6})`
                          : activeDirection === "up"
                            ? `rgba(245,158,11,${0.4 + (finalH / 100) * 0.6})`
                            : activeDirection === "right"
                              ? `rgba(16,185,129,${0.4 + (finalH / 100) * 0.6})`
                              : `rgba(249,115,22,${0.35 + (finalH / 100) * 0.65})`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* ─── Real-time transcript ─── */}
          {(confirmedText || partialText) && (
            <div className="absolute left-8 right-8 top-[58%] flex justify-center">
              <p className="text-center text-base leading-relaxed max-w-xs">
                <span className="text-white/80">{confirmedText}</span>
                <span className="text-white/35">{partialText}</span>
              </p>
            </div>
          )}

          {/* ─── SWIPE ZONES: Large directional labels ─── */}
          {/* LEFT — Cancel */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center transition-all duration-200"
            style={{
              opacity: activeDirection === "left" ? 0.7 + progress * 0.3 : activeDirection === "none" ? 0.35 : 0.1,
              transform: `translateY(-50%) translateX(${activeDirection === "left" ? 8 + progress * 12 : 8}px) scale(${activeDirection === "left" ? 1 + progress * 0.3 : 1})`,
            }}
          >
            <div className={cn(
              "flex flex-col items-center gap-2 transition-all duration-200",
            )}>
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200",
                activeDirection === "left"
                  ? "bg-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.3)]"
                  : "bg-white/8",
              )}>
                <X className={cn(
                  "transition-all duration-200",
                  activeDirection === "left" ? "w-7 h-7 text-red-400" : "w-5 h-5 text-white/40",
                )} />
              </div>
              <span className={cn(
                "font-semibold tracking-wider transition-all duration-200",
                activeDirection === "left"
                  ? "text-base text-red-400"
                  : "text-xs text-white/30",
              )}>
                取消
              </span>
            </div>
          </div>

          {/* RIGHT — Lock */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center transition-all duration-200"
            style={{
              opacity: activeDirection === "right" ? 0.7 + progress * 0.3 : activeDirection === "none" ? 0.35 : 0.1,
              transform: `translateY(-50%) translateX(${activeDirection === "right" ? -8 - progress * 12 : -8}px) scale(${activeDirection === "right" ? 1 + progress * 0.3 : 1})`,
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200",
                activeDirection === "right"
                  ? "bg-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                  : "bg-white/8",
              )}>
                <Lock className={cn(
                  "transition-all duration-200",
                  activeDirection === "right" ? "w-7 h-7 text-emerald-400" : "w-5 h-5 text-white/40",
                )} />
              </div>
              <span className={cn(
                "font-semibold tracking-wider transition-all duration-200",
                activeDirection === "right"
                  ? "text-base text-emerald-400"
                  : "text-xs text-white/30",
              )}>
                常驻
              </span>
            </div>
          </div>

          {/* UP — Command */}
          <div
            className="absolute top-[28%] left-1/2 -translate-x-1/2 flex items-center transition-all duration-200"
            style={{
              opacity: activeDirection === "up" ? 0.7 + progress * 0.3 : activeDirection === "none" ? 0.35 : 0.1,
              transform: `translateX(-50%) translateY(${activeDirection === "up" ? -progress * 16 : 0}px) scale(${activeDirection === "up" ? 1 + progress * 0.3 : 1})`,
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200",
                activeDirection === "up"
                  ? "bg-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.3)]"
                  : "bg-white/8",
              )}>
                <Command className={cn(
                  "transition-all duration-200",
                  activeDirection === "up" ? "w-7 h-7 text-amber-400" : "w-5 h-5 text-white/40",
                )} />
              </div>
              <span className={cn(
                "font-semibold tracking-wider transition-all duration-200",
                activeDirection === "up"
                  ? "text-base text-amber-400"
                  : "text-xs text-white/30",
              )}>
                指令
              </span>
            </div>
          </div>

          {/* BOTTOM CENTER — Release to send hint */}
          <div
            className="absolute bottom-[160px] left-1/2 -translate-x-1/2 transition-all duration-200"
            style={{
              opacity: activeDirection === "none" ? 0.8 : 0.2,
              transform: `translateX(-50%) scale(${activeDirection === "none" ? 1 : 0.85})`,
            }}
          >
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
              <Send className="w-4 h-4 text-white/50" />
              <span className="text-sm text-white/70 font-medium">松开发送</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── FAB Button ─── */}
      <div
        className="fixed bottom-[54px] left-1/2 z-40"
        style={{
          transform: `translateX(-50%) translateX(${fabOffsetX}px) translateY(${fabOffsetY}px)`,
          transition: phase === "recording" ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Processing capsule / Notify capsule */}
        {processing && phase === "idle" ? (
          <div
            className="flex items-center gap-2 h-12 px-4 rounded-full text-white animate-bubble-enter"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)", boxShadow: "0 8px 24px rgba(28, 28, 24, 0.06)" }}
          >
            <Sparkles className="w-5 h-5 animate-spin-slow shrink-0" />
            <span className="text-sm font-medium whitespace-nowrap">{wittyText}</span>
          </div>
        ) : capsuleNotify && phase === "idle" ? (
          <div
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-full text-white animate-bubble-enter"
            style={{
              background: capsuleNotify.level === "error"
                ? "linear-gradient(135deg, #9B2C2C, #C53030)"
                : capsuleNotify.level === "success"
                  ? "linear-gradient(135deg, #276749, #38A169)"
                  : "linear-gradient(135deg, #89502C, #C8845C)",
              boxShadow: "0 8px 24px rgba(28, 28, 24, 0.06)",
            }}
          >
            {capsuleNotify.level === "error" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : capsuleNotify.level === "success" ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : null}
            <span className="text-sm font-medium whitespace-nowrap">{capsuleNotify.text}</span>
          </div>
        ) : (
          <>
            {/* Pressing ripples */}
            {phase === "pressing" && (
              <>
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-fab-ripple" />
                <div
                  className="absolute inset-0 rounded-full bg-primary/15 animate-fab-ripple"
                  style={{ animationDelay: "0.4s" }}
                />
              </>
            )}

            {/* Recording ring — larger, more dramatic */}
            {phase === "recording" && (
              <>
                <div className="absolute -inset-3 rounded-full border-2 border-primary/40 animate-pulse pointer-events-none" />
                <div className="absolute -inset-6 rounded-full border border-primary/15 animate-pulse pointer-events-none" style={{ animationDelay: "0.5s" }} />
              </>
            )}

            <button
              ref={fabRef}
              type="button"
              {...handlers}
              onPointerDown={(e) => {
                longPressTriggeredRef.current = false;
                pointerIdRef.current = e.pointerId;
                startPreCapture();
                handlers.onPointerDown(e);
              }}
              onClick={() => {
                if (!longPressTriggeredRef.current) {
                  setShowTextSheet(true);
                }
              }}
              className={cn(
                "relative flex items-center justify-center rounded-full select-none touch-none transition-all duration-300",
                "text-white",
                phase === "idle" && "w-14 h-14",
                phase === "pressing" && "w-16 h-16 scale-105",
                phase === "recording" && "w-14 h-14",
              )}
              style={{
                background: phase === "recording"
                  ? "#C45C5C"
                  : "linear-gradient(135deg, #89502C, #C8845C)",
                boxShadow: "0 8px 24px rgba(28, 28, 24, 0.06)",
              }}
            >
              {phase === "idle" ? (
                <Mic className="w-6 h-6" />
              ) : (
                <Mic className={cn(
                  "transition-all duration-200",
                  phase === "recording" ? "w-6 h-6 animate-pulse" : "w-7 h-7",
                )} />
              )}
            </button>
          </>
        )}
      </div>

      <TextBottomSheet
        open={showTextSheet}
        onClose={() => setShowTextSheet(false)}
        onStartReview={onStartReview}
        onCommandMode={(text) => {
          setShowTextSheet(false);
          onOpenCommandChat?.(text);
        }}
        onSkillSelect={(skillName) => {
          setShowTextSheet(false);
          onOpenSkillChat?.(skillName);
        }}
        commandContext={commandContext}
        activeNotebook={activeNotebook}
        sourceContext={sourceContext}
        onRecordPress={() => {
          longPressTriggeredRef.current = true;
          gestures.forcePhase("locked");
          startRecording();
        }}
      />
    </>
  );
}
