"use client";

import { useState } from "react";
import { Pause, X, Play, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordingImmersiveProps {
  duration: number;
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
  paused,
  onTogglePause,
  onCancel,
  onDone,
}: RecordingImmersiveProps) {
  // 点击呼吸图标 → 暂停并展开；点击继续 → 收起
  // paused 由父组件控制

  return (
    <div
      className="fixed left-1/2 z-40"
      style={{
        bottom: "calc(54px + var(--kb-offset, 0px))",
        transform: "translateX(-50%)",
      }}
    >
      {paused ? (
        // ─── 展开态：暂停控制面板 ───
        <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
          <div
            className="rounded-2xl px-6 py-4 flex flex-col items-center gap-3"
            style={{ background: "rgba(10,10,15,0.95)" }}
          >
            {/* 暂停状态 + 时长 */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm text-white/60 tracking-widest">⏸ {formatDuration(duration)}</span>
            </div>

            {/* 三个按钮横排 */}
            <div className="flex items-center gap-5">
              {/* 取消 */}
              <button
                type="button"
                onClick={onCancel}
                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                aria-label="取消录音"
              >
                <X className="w-6 h-6" />
              </button>

              {/* 继续 */}
              <button
                type="button"
                onClick={onTogglePause}
                className="w-16 h-16 rounded-[20px] flex items-center justify-center transition-all duration-200 active:scale-90 border border-white/20 bg-white/10 text-white hover:bg-white/15"
                aria-label="继续录音"
              >
                <Play className="w-7 h-7 ml-0.5" />
              </button>

              {/* 保存 */}
              <button
                type="button"
                onClick={onDone}
                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                aria-label="保存录音"
              >
                <Check className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ─── 收起态：呼吸录音指示器 ───
        <button
          type="button"
          onClick={onTogglePause}
          className="flex flex-col items-center gap-1"
          aria-label="点击暂停录音"
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white backdrop-blur-xl animate-breathe"
            style={{
              background: "rgba(196,92,92,0.75)",
            }}
          >
            <Pause className="w-8 h-8" />
          </div>
          <span className="text-xs font-mono text-muted-accessible tabular-nums">
            {formatDuration(duration)}
          </span>
        </button>
      )}
    </div>
  );
}
