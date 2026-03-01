"use client";

import { Play, Square, X, Check } from "lucide-react";

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
      <div className="absolute inset-0 bg-slate-950/95" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.22) 0%, transparent 62%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
        <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] tracking-[0.16em] text-white/75">
          常驻录音
        </div>

        <p className="text-6xl font-light text-white tabular-nums tracking-[0.28em]">
          {formatDuration(duration)}
        </p>

        <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/8 backdrop-blur-md px-4 py-4 shadow-2xl">
          <div className="flex items-center justify-center gap-[3px] h-16">
            {waveHeights.map((h, i) => (
              <div
                key={i}
                className="rounded-full bg-primary transition-all duration-100"
                style={{
                  width: "3px",
                  height: `${Math.max(6, h)}px`,
                  opacity: 0.35 + (h / 54) * 0.65,
                }}
              />
            ))}
          </div>
        </div>

        {(confirmedText || partialText) && (
          <div className="max-w-sm text-center px-4 py-3 rounded-2xl border border-white/12 bg-white/6 backdrop-blur-sm">
            <span className="text-sm text-white/80 leading-relaxed">{confirmedText}</span>
            <span className="text-sm text-white/40 leading-relaxed">{partialText}</span>
          </div>
        )}

        <div className="relative mt-1 h-24 w-full max-w-sm flex items-center justify-center">
          {paused && (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="absolute left-0 w-14 h-14 rounded-2xl border border-red-300/60 bg-red-500/90 text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                aria-label="取消录音"
              >
                <X className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={onDone}
                className="absolute right-0 w-14 h-14 rounded-2xl border border-emerald-200/60 bg-emerald-500 text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                aria-label="完成录音"
              >
                <Check className="w-6 h-6" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onTogglePause}
            className="w-20 h-20 rounded-[26px] bg-white/12 border border-white/25 text-white shadow-xl active:scale-95 transition-transform flex items-center justify-center"
            aria-label={paused ? "继续录音" : "暂停录音"}
          >
            {paused ? <Play className="w-8 h-8" /> : <Square className="w-8 h-8 fill-current" />}
          </button>
        </div>

        <p className="text-xs text-white/55 tracking-wide">
          {paused ? "已暂停，点中间继续；左侧取消，右侧完成" : "点击中间方块暂停录音"}
        </p>
      </div>
    </div>
  );
}
