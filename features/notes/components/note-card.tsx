"use client";

import { useRef, useCallback, useState } from "react";
import { MapPin, Clock, Sparkles, Check, AlertCircle, ChevronDown, ChevronUp, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRelated } from "@/features/notes/hooks/use-related";
import type { HierarchyTag } from "@/shared/lib/types";

export interface Note {
  id: string;
  title: string;
  tags: string[];
  hierarchy_tags?: HierarchyTag[];
  summary: string;
  date: string;
  time: string;
  location?: string;
  type?: "diary" | "daily" | "weekly" | "monthly";
  status?: string;
}

const TAG_STYLES: Record<string, { bg: string; fg: string }> = {
  work: { bg: "var(--tag-work-bg)", fg: "var(--tag-work-fg)" },
  meeting: { bg: "var(--tag-meeting-bg)", fg: "var(--tag-meeting-fg)" },
  idea: { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  personal: { bg: "var(--tag-personal-bg)", fg: "var(--tag-personal-fg)" },
  todo: { bg: "var(--tag-todo-bg)", fg: "var(--tag-todo-fg)" },
  study: { bg: "var(--tag-study-bg)", fg: "var(--tag-study-fg)" },
  health: { bg: "var(--tag-health-bg)", fg: "var(--tag-health-fg)" },
  travel: { bg: "var(--tag-travel-bg)", fg: "var(--tag-travel-fg)" },
};

function getTagStyle(tag: string): { className: string; style?: React.CSSProperties } {
  const entry = TAG_STYLES[tag.toLowerCase()];
  if (!entry) return { className: "bg-secondary text-secondary-foreground" };
  return {
    className: "",
    style: {
      backgroundColor: `hsl(${entry.bg})`,
      color: `hsl(${entry.fg})`,
    },
  };
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
  const [expanded, setExpanded] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  const isError = note.status === "error" || note.status === "failed";
  const isProcessing = !isError && note.status != null && note.status !== "completed";
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
          <div className="space-y-2">
            <div className="h-3 animate-shimmer rounded w-2/3" />
            <div className="h-3 animate-shimmer rounded w-full" style={{ animationDelay: "0.1s" }} />
            <div className="h-3 animate-shimmer rounded w-4/5" style={{ animationDelay: "0.2s" }} />
          </div>
          <div className="flex items-center gap-1 mt-3 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="text-[11px]">{note.time}</span>
          </div>
        </div>
      </div>
    );
  }

  // Error placeholder card — processing failed, still show note with transcript fallback
  if (isError) {
    return (
      <div className="flex gap-3 relative" onClick={onClick} role="button" tabIndex={0}>
        <div className="flex flex-col items-center pt-1.5 shrink-0 w-5">
          <div className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background bg-destructive/60" />
          {!isLast && <div className="w-px flex-1 bg-border mt-1.5" />}
        </div>
        <div className="flex-1 rounded-2xl p-4 mb-3 border border-destructive/20 bg-card/60">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-destructive/70" />
            <span className="text-xs text-destructive/70">处理失败</span>
          </div>
          <p className="text-sm text-foreground/80 line-clamp-2">{note.title}</p>
          <div className="flex items-center gap-1 mt-2 text-muted-foreground">
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
    } else if (onClick) {
      onClick();
    } else {
      setExpanded((prev) => !prev);
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
          "flex-1 rounded-2xl p-4 mb-3 text-left transition-all duration-200 pressable",
          "hover:shadow-md",
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

        {/* Hierarchy Tags (L2/L1/L3) + Atom Tags */}
        {((note.hierarchy_tags?.length ?? 0) > 0 || note.tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {(note.hierarchy_tags ?? []).map((ht) => (
              <span
                key={`h-${ht.level}-${ht.label}`}
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  ht.level === 2 && "bg-deer/15 text-deer",
                  ht.level === 1 && "border border-deer/40 text-deer",
                  ht.level === 3 && "bg-surface-high text-muted-accessible",
                )}
              >
                {ht.label}
              </span>
            ))}
            {note.tags.map((tag) => {
              const tagStyle = getTagStyle(tag);
              return (
                <span
                  key={tag}
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                    tagStyle.className,
                  )}
                  style={tagStyle.style}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}

        {/* Summary */}
        <p
          ref={summaryRef}
          className={cn(
            "mt-2.5 text-xs leading-relaxed text-muted-foreground",
            !expanded && (isSummary ? "line-clamp-6" : "line-clamp-4"),
          )}
        >
          {note.summary}
        </p>

        {/* 展开/收起指示 */}
        {!onClick && note.summary && note.summary.length > 120 && (
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-primary/70">
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>收起</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>展开全文</span>
              </>
            )}
          </div>
        )}

        {/* Related — only for completed notes */}
        {note.status === "completed" && (
          <div className="flex items-center gap-3 mt-2 border-t border-border/40 pt-2">
            <RelatedBadge noteId={note.id} />
          </div>
        )}
      </button>
    </div>
  );
}

function RelatedBadge({ noteId }: { noteId: string }) {
  const { count, loaded, fetch } = useRelated(noteId);

  // 懒加载：首次渲染时触发
  if (!loaded) {
    fetch();
    return null;
  }

  // 场景5: 无关联时不显示
  if (count === 0) return null;

  return (
    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
      <Link className="w-3 h-3" />
      <span>{count}</span>
    </span>
  );
}

