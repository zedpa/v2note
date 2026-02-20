"use client";

import { X, Square } from "lucide-react";

interface RecordingImmersiveProps {
  duration: number;
  waveHeights: number[];
  confirmedText: string;
  partialText: string;
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
  onCancel,
  onDone,
}: RecordingImmersiveProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end animate-mood-shift">
      {/* Dark backdrop with primary radial glow */}
      <div className="absolute inset-0 bg-foreground/95" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 60%, hsl(var(--primary) / 0.15) 0%, transparent 60%)",
        }}
      />

      {/* Content */}
      <div className="relative flex-1 flex items-center justify-center w-full">
        <div className="flex flex-col items-center gap-8">
          {/* Recording indicator */}
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-background/60 font-medium">
              录音中
            </span>
          </div>

          {/* Waveform */}
          <div className="flex items-center justify-center gap-1 h-16">
            {waveHeights.slice(0, 24).map((h, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-primary transition-all duration-100"
                style={{
                  height: `${h}px`,
                  opacity: 0.4 + (h / 34) * 0.6,
                }}
              />
            ))}
          </div>

          {/* Duration */}
          <p className="text-5xl font-extralight text-background tabular-nums tracking-widest">
            {formatDuration(duration)}
          </p>

          {/* Realtime transcript */}
          {(confirmedText || partialText) && (
            <div className="max-w-xs text-center px-4">
              <span className="text-sm text-background/80">
                {confirmedText}
              </span>
              <span className="text-sm text-background/40">{partialText}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="relative flex items-center gap-16 pb-16 mb-safe">
        <button
          type="button"
          onClick={onCancel}
          className="flex flex-col items-center gap-1.5"
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-background/10 text-background/70">
            <X className="w-6 h-6" />
          </div>
          <span className="text-[10px] text-background/40">取消</span>
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex flex-col items-center gap-1.5"
        >
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
