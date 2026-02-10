"use client";

import { useRef, useCallback } from "react";
import { MapPin, Clock, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Note {
  id: string;
  title: string;
  tags: string[];
  summary: string;
  date: string;
  time: string;
  location?: string;
  type?: "diary" | "daily" | "weekly" | "monthly";
  status?: string;
}

const TAG_STYLES: Record<string, string> = {
  work: "bg-primary/10 text-primary",
  meeting: "bg-accent/10 text-accent",
  idea: "bg-amber-50 text-amber-600",
  personal: "bg-teal-50 text-teal-600",
  todo: "bg-rose-50 text-rose-600",
  study: "bg-sky-50 text-sky-600",
  health: "bg-emerald-50 text-emerald-600",
  travel: "bg-indigo-50 text-indigo-600",
};

function getTagStyle(tag: string) {
  return TAG_STYLES[tag.toLowerCase()] || "bg-secondary text-secondary-foreground";
}

const LONG_PRESS_MS = 500;

interface NoteCardProps {
  note: Note;
  isLast: boolean;
  onClick?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
}

export function NoteCard({
  note,
  isLast,
  onClick,
  selected,
  selectionMode,
  onLongPress,
  onToggleSelect,
}: NoteCardProps) {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const didLongPress = useRef(false);

  const isProcessing = note.status && note.status !== "completed";
  const isSummary = note.type === "daily" || note.type === "weekly" || note.type === "monthly";

  // Processing placeholder card
  if (isProcessing) {
    return (
      <div className="flex gap-3 relative">
        <div className="flex flex-col items-center pt-1.5 shrink-0 w-5">
          <div className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background bg-muted-foreground/40 animate-pulse" />
          {!isLast && <div className="w-px flex-1 bg-border mt-1.5" />}
        </div>
        <div className="flex-1 rounded-2xl p-4 mb-3 border border-border/60 bg-card/60">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-sm font-semibold text-foreground/70">AI 处理中...</span>
          </div>
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-secondary rounded w-2/3" />
            <div className="h-3 bg-secondary rounded w-full" />
            <div className="h-3 bg-secondary rounded w-4/5" />
          </div>
          <div className="flex items-center gap-1 mt-3 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="text-[11px]">{note.time}</span>
          </div>
        </div>
      </div>
    );
  }

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (didLongPress.current) return;
    if (selectionMode) {
      onToggleSelect?.();
    } else {
      onClick?.();
    }
  }, [selectionMode, onToggleSelect, onClick]);

  return (
    <div className="flex gap-3 relative">
      {/* Timeline dot and line */}
      <div className="flex flex-col items-center pt-1.5 shrink-0 w-5">
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background",
            isSummary ? "bg-accent" : "bg-primary",
          )}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-border mt-1.5" />
        )}
      </div>

      {/* Card content */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleClick}
        className={cn(
          "flex-1 rounded-2xl p-4 mb-3 text-left transition-all duration-200",
          "hover:shadow-md active:scale-[0.98]",
          "border border-border/60",
          isSummary ? "bg-accent/5" : "bg-card",
          selectionMode && selected && "ring-2 ring-primary border-primary/40",
        )}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
                selected
                  ? "bg-primary border-primary"
                  : "border-muted-foreground/30",
              )}
            >
              {selected && <Check className="w-3 h-3 text-primary-foreground" />}
            </div>
          </div>
        )}

        {/* AI summary badge */}
        {isSummary && (
          <div className="flex items-center gap-1 mb-2">
            <Sparkles className="w-3 h-3 text-accent" />
            <span className="text-[10px] font-medium text-accent">
              {note.type === "daily" && "AI 日报"}
              {note.type === "weekly" && "AI 周报"}
              {note.type === "monthly" && "AI 月报"}
            </span>
          </div>
        )}

        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {note.title}
        </h3>

        {/* Meta row: time + location */}
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="text-[11px]">{note.time}</span>
          </div>
          {note.location && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="text-[11px]">{note.location}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  getTagStyle(tag),
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        <p
          className={cn(
            "mt-2.5 text-xs leading-relaxed text-muted-foreground",
            isSummary ? "line-clamp-6" : "line-clamp-4",
          )}
        >
          {note.summary}
        </p>
      </button>
    </div>
  );
}
