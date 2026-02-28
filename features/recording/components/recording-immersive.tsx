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
      <div className="absolute inset-0 bg-black/92" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 55%, hsl(var(--primary) / 0.14) 0%, transparent 65%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
        <div className="flex items-center justify-center gap-[3px] h-20">
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

        <p className="text-6xl font-extralight text-white/90 tabular-nums tracking-widest">
          {formatDuration(duration)}
        </p>

        {(confirmedText || partialText) && (
          <div className="max-w-sm text-center px-4 py-3 rounded-2xl bg-white/8 backdrop-blur-sm">
            <span className="text-sm text-white/80 leading-relaxed">{confirmedText}</span>
            <span className="text-sm text-white/40 leading-relaxed">{partialText}</span>
          </div>
        )}

        <div className="relative mt-2 h-24 w-full max-w-sm flex items-center justify-center">
          {paused && (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="absolute left-0 w-12 h-12 rounded-2xl bg-red-500/90 text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                aria-label="取消录音"
              >
                <X className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={onDone}
                className="absolute right-0 w-12 h-12 rounded-2xl bg-emerald-500 text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                aria-label="完成录音"
              >
                <Check className="w-6 h-6" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onTogglePause}
            className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 text-white shadow-xl active:scale-95 transition-transform flex items-center justify-center"
            aria-label={paused ? "继续录音" : "暂停录音"}
          >
            {paused ? <Play className="w-8 h-8" /> : <Square className="w-8 h-8 fill-current" />}
          </button>
        </div>

        <p className="text-xs text-white/45">
          {paused ? "已暂停，点中间继续；左侧取消，右侧完成" : "点击中间方块暂停录音"}
        </p>
      </div>
    </div>
  );
}
