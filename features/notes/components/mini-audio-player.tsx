"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface MiniAudioPlayerProps {
  src: string;
  className?: string;
}

function seededBars(seed: string, count: number): number[] {
  const bars: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < count; i++) {
    h = ((h << 5) - h + i) | 0;
    bars.push(0.3 + (Math.abs(h) % 70) / 100);
  }
  return bars;
}

export function MiniAudioPlayer({ src, className }: MiniAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number>(0);

  const bars = seededBars(src, 20);

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.duration) {
      setProgress(audio.currentTime / audio.duration);
    }
    if (!audio.paused) {
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const audio = audioRef.current;
      if (!audio) return;

      if (playing) {
        audio.pause();
        setPlaying(false);
      } else {
        audio.play().then(() => {
          setPlaying(true);
          rafRef.current = requestAnimationFrame(updateProgress);
        }).catch(() => {});
      }
    },
    [playing, updateProgress],
  );

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-full bg-secondary/60",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
      />

      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground shrink-0"
      >
        {playing ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex items-end gap-[2px] h-5 flex-1">
        {bars.map((h, i) => {
          const filled = i / bars.length < progress;
          return (
            <div
              key={i}
              className={cn(
                "w-[3px] rounded-full transition-colors duration-150",
                filled ? "bg-primary" : "bg-muted-foreground/25",
              )}
              style={{ height: `${h * 100}%` }}
            />
          );
        })}
      </div>

      <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
        {formatTime(playing ? (audioRef.current?.currentTime ?? 0) : duration)}
      </span>
    </div>
  );
}
