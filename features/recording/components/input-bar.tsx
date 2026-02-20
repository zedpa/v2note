"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Keyboard, Send, Plus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePCMRecorder } from "@/features/recording/hooks/use-pcm-recorder";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";
import { emit } from "@/features/recording/lib/events";
import { executeCommand, getCommandNames } from "@/features/commands/lib/registry";
import type { CommandContext } from "@/features/commands/lib/registry";
import { createManualNote } from "@/features/notes/lib/manual-note";
import { toast } from "sonner";

type InputMode = "voice" | "text";
type VoicePhase = "idle" | "pressing" | "recording" | "locked";

interface InputBarProps {
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  commandContext?: Partial<CommandContext>;
}

export function InputBar({ onStartReview, commandContext }: InputBarProps) {
  const [mode, setMode] = useState<InputMode>("voice");
  const [text, setText] = useState("");
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [displayDuration, setDisplayDuration] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(16).fill(12));
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);

  // Realtime transcription state
  const [confirmedText, setConfirmedText] = useState("");
  const [partialText, setPartialText] = useState("");

  const recorder = usePCMRecorder();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveRef = useRef<NodeJS.Timeout | null>(null);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPressingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const gatewayUnsubRef = useRef<(() => void) | null>(null);

  const SLIDE_UP_THRESHOLD = 80;
  const SLIDE_LEFT_THRESHOLD = 100;

  // Command autocomplete
  useEffect(() => {
    if (text.startsWith("/") && text.length > 1) {
      const partial = text.slice(1).toLowerCase();
      const matches = getCommandNames().filter((c) => c.startsWith(partial));
      setCommandSuggestions(matches);
    } else {
      setCommandSuggestions([]);
    }
  }, [text]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const startTimers = useCallback(() => {
    setDisplayDuration(0);
    timerRef.current = setInterval(() => setDisplayDuration((d) => d + 1), 1000);
    waveRef.current = setInterval(() => {
      setWaveHeights(Array(16).fill(0).map(() => Math.random() * 28 + 6));
    }, 120);
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (waveRef.current) clearInterval(waveRef.current);
    timerRef.current = null;
    waveRef.current = null;
    setWaveHeights(Array(16).fill(12));
  }, []);

  // Listen for ASR events from gateway
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
          // AI processing done in background
          emit("recording:processed");
          break;
      }
    });
    gatewayUnsubRef.current = unsub;

    return () => {
      unsub();
      gatewayUnsubRef.current = null;
    };
  }, []);

  // ── Voice recording handlers ──

  const handleSave = useCallback(async () => {
    try {
      recorder.stopRecording();
      const deviceId = await getDeviceId();
      const client = getGatewayClient();
      client.send({ type: "asr.stop", payload: { deviceId } });
      toast("正在处理录音...");
    } catch (err: any) {
      toast.error(`录音保存失败: ${err.message}`);
    } finally {
      setConfirmedText("");
      setPartialText("");
    }
  }, [recorder]);

  const handleCancel = useCallback(async () => {
    stopTimers();
    recorder.cancelRecording();
    try {
      const deviceId = await getDeviceId();
      const client = getGatewayClient();
      client.send({ type: "asr.cancel", payload: { deviceId } });
    } catch {
      // ignore
    }
    setVoicePhase("idle");
    setDisplayDuration(0);
    setConfirmedText("");
    setPartialText("");
  }, [stopTimers, recorder]);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (voicePhase === "locked") return;
      isPressingRef.current = true;
      startYRef.current = e.clientY;
      startXRef.current = e.clientX;
      setVoicePhase("pressing");

      longPressRef.current = setTimeout(async () => {
        if (isPressingRef.current) {
          try {
            const deviceId = await getDeviceId();
            const client = getGatewayClient();
            if (!client.connected) client.connect();

            // Start ASR on gateway
            client.send({ type: "asr.start", payload: { deviceId } });

            // Start PCM recording, sending chunks to gateway
            await recorder.startRecording({
              onPCMData: (chunk) => {
                client.sendBinary(chunk);
              },
              onError: (err) => {
                toast.error(`录音错误: ${err.message}`);
                setVoicePhase("idle");
              },
            });

            setVoicePhase("recording");
            setConfirmedText("");
            setPartialText("");
            startTimers();
          } catch (err: any) {
            toast.error(`无法开始录音: ${err.message}`);
            setVoicePhase("idle");
            isPressingRef.current = false;
          }
        }
      }, 300);
    },
    [voicePhase, startTimers, recorder],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (voicePhase !== "recording") return;
      const deltaY = startYRef.current - e.clientY;

      // Slide up → lock recording
      if (deltaY >= SLIDE_UP_THRESHOLD) {
        setVoicePhase("locked");
        isPressingRef.current = false;
      }
    },
    [voicePhase],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (longPressRef.current) clearTimeout(longPressRef.current);

      if (voicePhase === "pressing") {
        setVoicePhase("idle");
        isPressingRef.current = false;
        return;
      }

      if (voicePhase === "recording") {
        const deltaX = startXRef.current - e.clientX;
        if (deltaX > SLIDE_LEFT_THRESHOLD) {
          // Cancel
          handleCancel();
        } else {
          // Save
          stopTimers();
          setVoicePhase("idle");
          setDisplayDuration(0);
          handleSave();
        }
      }

      isPressingRef.current = false;
    },
    [voicePhase, stopTimers, handleSave, handleCancel],
  );

  const handleStopLocked = useCallback(() => {
    stopTimers();
    setVoicePhase("idle");
    setDisplayDuration(0);
    handleSave();
  }, [stopTimers, handleSave]);

  // ── Text submission ──

  const handleTextSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Check for commands
    const ctx: CommandContext = {
      ...commandContext,
      startReview: onStartReview,
    };
    const cmdResult = executeCommand(trimmed, ctx);
    if (cmdResult) {
      if (cmdResult.message) toast(cmdResult.message);
      setText("");
      return;
    }

    // Normal text → create manual note
    setText("");
    try {
      toast("正在保存...");
      await createManualNote({ content: trimmed, useAi: true });
      toast("已保存");
      emit("recording:processed");
    } catch (err: any) {
      toast.error(`保存失败: ${err.message}`);
    }
  }, [text, commandContext, onStartReview]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  // ── Full-screen locked recording ──
  if (voicePhase === "locked") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-foreground/95 backdrop-blur-md">
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm text-background/60 font-medium">录音中</span>
            </div>
            <div className="flex items-center gap-1 h-16">
              {waveHeights.map((h, i) => (
                <div
                  key={`lw-${i}`}
                  className="w-1 rounded-full bg-primary transition-all duration-100"
                  style={{ height: `${h}px`, opacity: 0.5 + (h / 34) * 0.5 }}
                />
              ))}
            </div>
            <p className="text-5xl font-extralight text-background tabular-nums tracking-widest">
              {formatDuration(displayDuration)}
            </p>
            {/* Realtime transcript */}
            {(confirmedText || partialText) && (
              <div className="max-w-xs text-center px-4">
                <span className="text-sm text-background/80">{confirmedText}</span>
                <span className="text-sm text-background/40">{partialText}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-16 pb-16 mb-safe">
          <button type="button" onClick={handleCancel} className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-background/10 text-background/70">
              <X className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-background/40">取消</span>
          </button>
          <button type="button" onClick={handleStopLocked} className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Square className="w-7 h-7 fill-current" />
            </div>
            <span className="text-[10px] text-background/40">完成</span>
          </button>
          <div className="w-14" />
        </div>
      </div>
    );
  }

  // ── Inline bar ──
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="max-w-lg mx-auto px-3 pb-2">
        {/* Command suggestions */}
        {commandSuggestions.length > 0 && (
          <div className="mb-1 flex gap-1 flex-wrap">
            {commandSuggestions.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => setText(`/${cmd} `)}
                className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground"
              >
                /{cmd}
              </button>
            ))}
          </div>
        )}

        {/* Recording wave indicator + realtime text */}
        {voicePhase === "recording" && (
          <div className="mb-2">
            <div className="flex items-center justify-center gap-1 h-8">
              {waveHeights.slice(0, 12).map((h, i) => (
                <div
                  key={`mw-${i}`}
                  className="w-0.5 rounded-full bg-primary transition-all duration-100"
                  style={{ height: `${h * 0.6}px`, opacity: 0.4 + (h / 34) * 0.6 }}
                />
              ))}
              <span className="ml-2 text-xs text-primary tabular-nums">
                {formatDuration(displayDuration)}
              </span>
            </div>
            {/* Realtime transcript preview */}
            {(confirmedText || partialText) && (
              <div className="text-center px-4 mt-1">
                <span className="text-xs text-foreground/70">{confirmedText}</span>
                <span className="text-xs text-foreground/40">{partialText}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-2 bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-sm">
          {/* Mode toggle */}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "voice" ? "text" : "voice");
              if (mode === "voice") {
                setTimeout(() => inputRef.current?.focus(), 100);
              }
            }}
            className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {mode === "voice" ? <Keyboard className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {mode === "voice" ? (
            /* Voice button */
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={cn(
                "flex-1 flex items-center justify-center py-2 rounded-xl select-none touch-none cursor-pointer transition-colors",
                voicePhase === "recording"
                  ? "bg-primary/10 text-primary"
                  : voicePhase === "pressing"
                    ? "bg-secondary/80 text-foreground"
                    : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <span className="text-sm font-medium">
                {voicePhase === "recording"
                  ? "松开发送 ↑锁定"
                  : voicePhase === "pressing"
                    ? "按住中..."
                    : "按住 说话"}
              </span>
            </div>
          ) : (
            /* Text input */
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleTextSubmit();
                }
              }}
              placeholder="输入文字或 /命令..."
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm outline-none placeholder:text-muted-foreground/50 max-h-24 py-1.5"
              style={{ minHeight: "28px" }}
            />
          )}

          {/* Right button */}
          {mode === "text" && text.trim() ? (
            <button
              type="button"
              onClick={handleTextSubmit}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          ) : mode === "voice" ? (
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
