"use client";

import { Play, Square, X, Check, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordingImmersiveProps {
  duration: number;
  waveHeights: number[];
  confirmedText: string;
  partialText: string;
  paused: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
  onDone: () => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function RecordingImmersive({
  duration,
  waveHeights,
  confirmedText,
  partialText,
  paused,
  onTogglePause,
  onCancel,
  onDone,
}: RecordingImmersiveProps) {
  return (
    <div className="fixed inset-0 z-50">
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0f]" />
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: paused
            ? "radial-gradient(circle at 50% 45%, rgba(249,115,22,0.06) 0%, transparent 60%)"
            : "radial-gradient(circle at 50% 45%, rgba(249,115,22,0.18) 0%, transparent 55%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center px-8">
        {/* Status badge */}
        <div className="pt-safe mt-14 mb-6">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/12 bg-white/5 animate-chip-fly-in">
            {paused ? (
              <div className="w-2 h-2 rounded-full bg-amber-500" />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            )}
            <span className="text-[13px] tracking-[0.2em] text-white/60 uppercase font-medium">
              {paused ? "已暂停" : "常驻录音"}
            </span>
          </div>
        </div>

        {/* Timer — massive */}
        <p className={cn(
          "text-7xl font-mono font-extralight tabular-nums tracking-[0.2em] transition-colors duration-300",
          paused ? "text-white/40" : "text-white/90",
        )}>
          {formatDuration(duration)}
        </p>

        {/* Waveform — large, full-width */}
        <div className="flex-shrink-0 w-full max-w-md mt-10 mb-8 rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-5 py-6">
          <div className="flex items-center justify-center gap-[4px] h-24">
            {waveHeights.map((h, i) => {
              const centerDist = Math.abs(i - 15.5) / 15.5;
              const falloff = 1 - centerDist * 0.35;
              const finalH = Math.max(4, h * falloff * 1.6);
              return (
                <div
                  key={i}
                  className="rounded-full transition-all duration-[80ms]"
                  style={{
                    width: "4px",
                    height: `${finalH}px`,
                    backgroundColor: `rgba(249,115,22,${paused ? 0.15 : 0.35 + (finalH / 90) * 0.65})`,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Transcript */}
        {(confirmedText || partialText) && (
          <div className="w-full max-w-md px-5 py-4 rounded-2xl border border-white/8 bg-white/[0.03] mb-8">
            <p className="text-center leading-relaxed">
              <span className="text-[15px] text-white/80">{confirmedText}</span>
              <span className="text-[15px] text-white/30">{partialText}</span>
            </p>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="w-full max-w-sm flex items-center justify-center gap-8 mb-6">
          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90",
              "border border-red-500/30 bg-red-500/10 text-red-400",
              "hover:bg-red-500/20",
            )}
            aria-label="取消录音"
          >
            <X className="w-7 h-7" />
          </button>

          {/* Pause/Resume — center, largest */}
          <button
            type="button"
            onClick={onTogglePause}
            className={cn(
              "w-20 h-20 rounded-[24px] flex items-center justify-center transition-all duration-200 active:scale-90",
              "border border-white/20 bg-white/10 text-white",
              "hover:bg-white/15 shadow-2xl",
            )}
            aria-label={paused ? "继续录音" : "暂停录音"}
          >
            {paused ? (
              <Mic className="w-9 h-9" />
            ) : (
              <Square className="w-8 h-8 fill-current" />
            )}
          </button>

          {/* Done */}
          <button
            type="button"
            onClick={onDone}
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90",
              "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
              "hover:bg-emerald-500/20",
            )}
            aria-label="完成录音"
          >
            <Check className="w-7 h-7" />
          </button>
        </div>

        {/* Hint text */}
        <p className="text-[13px] text-white/35 tracking-wide mb-safe pb-8">
          {paused ? "点击麦克风继续 · 左侧取消 · 右侧完成" : "点击方块暂停录音"}
        </p>
      </div>
    </div>
  );
}
