"use client";

import { useMemo } from "react";
import { MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { MiniAudioPlayer } from "./mini-audio-player";
import type { NoteItem } from "@/shared/lib/types";

interface NotesTimelineProps {
  filter?: string;
  onNoteClick?: (noteId: string) => void;
}

interface DayGroup {
  date: string;
  day: number;
  monthWeekday: string;
  notes: NoteItem[];
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function parseDayGroup(dateStr: string): { day: number; monthWeekday: string } {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = WEEKDAYS[d.getDay()];
  return { day, monthWeekday: `${month}月 周${weekday}` };
}

export function NotesTimeline({ filter, onNoteClick }: NotesTimelineProps) {
  const { notes, loading } = useNotes();

  const groups = useMemo(() => {
    let filtered = notes;
    if (filter && filter !== "全部") {
      filtered = notes.filter((n) => n.tags.includes(filter));
    }

    const map = new Map<string, NoteItem[]>();
    for (const note of filtered) {
      const date = note.created_at.split("T")[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(note);
    }

    const groups: DayGroup[] = [];
    for (const [date, dayNotes] of map) {
      const { day, monthWeekday } = parseDayGroup(date);
      groups.push({
        date,
        day,
        monthWeekday,
        notes: dayNotes.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      });
    }
    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [notes, filter]);

  if (loading) {
    return (
      <div className="px-4 space-y-3 pt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-5 bg-card shadow-sm animate-pulse"
          >
            <div className="h-2.5 bg-secondary rounded w-20 mb-4" />
            <div className="h-3 bg-secondary rounded w-full mb-2.5" />
            <div className="h-3 bg-secondary rounded w-4/5 mb-2.5" />
            <div className="h-3 bg-secondary rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="w-14 h-14 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <span className="text-xl font-light">0</span>
        </div>
        <p className="text-sm">暂无笔记</p>
        <p className="text-xs mt-1.5 text-muted-foreground/70">
          点击右下角按钮开始记录
        </p>
      </div>
    );
  }

  let cardIndex = 0;

  return (
    <div className="px-4 pt-2 pb-28">
      {groups.map((group) => (
        <div key={group.date} className="mb-6">
          {/* Day header — editorial style */}
          <div className="flex items-baseline gap-2.5 py-3">
            <span className="text-3xl font-light text-foreground/80 leading-none tabular-nums">
              {group.day}
            </span>
            <span className="text-xs text-muted-foreground tracking-wide">
              {group.monthWeekday}
            </span>
          </div>

          {/* Note cards */}
          <div className="space-y-3">
            {group.notes.map((note) => {
              const idx = cardIndex++;
              return (
                <TimelineCard
                  key={note.id}
                  note={note}
                  index={idx}
                  onClick={() => onNoteClick?.(note.id)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineCard({
  note,
  index,
  onClick,
}: {
  note: NoteItem;
  index: number;
  onClick?: () => void;
}) {
  // Only show skeleton if still processing AND no content available yet
  const hasContent = !!(note.short_summary || note.title !== "处理中...");
  const isProcessing = note.status !== "completed" && !hasContent;

  if (isProcessing) {
    return (
      <div
        className="rounded-2xl p-5 bg-card shadow-sm animate-card-enter"
        style={{ animationDelay: `${index * 60}ms` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-sm text-foreground/60">AI 处理中...</span>
        </div>
        <div className="space-y-2.5 animate-pulse">
          <div className="h-3 bg-secondary rounded w-3/4" />
          <div className="h-3 bg-secondary rounded w-full" />
          <div className="h-3 bg-secondary rounded w-2/3" />
        </div>
        <div className="flex items-center gap-1 mt-3 text-muted-foreground/60">
          <Clock className="w-3 h-3" />
          <span className="text-[11px] font-mono tabular-nums">{note.time}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl p-5 text-left transition-all duration-200",
        "hover:shadow-md active:scale-[0.98]",
        "bg-card shadow-sm",
        "animate-card-enter",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Time + location row */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground/70">
          {note.time}
        </span>
        {note.location && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <div className="flex items-center gap-0.5 text-muted-foreground/60">
              <MapPin className="w-3 h-3" />
              <span className="text-[11px]">{note.location}</span>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <p className="text-[15px] leading-[1.7] text-foreground line-clamp-5">
        {note.short_summary || note.title}
      </p>

      {/* Audio player */}
      {note.audio_path && (
        <div className="mt-3">
          <MiniAudioPlayer src={note.audio_path} />
        </div>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-primary/8 text-primary/80"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
