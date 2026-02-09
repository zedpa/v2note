"use client";

import { useState } from "react";
import { NoteCard } from "./note-card";
import type { Note } from "./note-card";
import { ProcessingIndicator } from "./processing-indicator";
import { useNotes } from "@/hooks/use-notes";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "week" | "month" | "year";

const VIEW_LABELS: { key: ViewMode; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
];

interface NotesGridProps {
  activeFilter: string;
  onNoteClick?: (noteId: string) => void;
}

export function NotesGrid({ activeFilter, onNoteClick }: NotesGridProps) {
  const [view, setView] = useState<ViewMode>("day");
  const { notes, loading, refetch } = useNotes();

  // Count processing notes
  const processingCount = notes.filter(
    (n) => n.status === "uploading" || n.status === "uploaded" || n.status === "processing",
  ).length;

  // Filter by tag
  const filtered =
    activeFilter === "全部"
      ? notes
      : notes.filter((n) =>
          n.tags.some(
            (tag) => tag === activeFilter || tag.toLowerCase() === activeFilter.toLowerCase(),
          ),
        );

  // Only show completed notes in the list (plus processing ones at top)
  const completedNotes = filtered.filter((n) => n.status === "completed");

  // Convert NoteItem to Note format for NoteCard
  const displayNotes: Note[] = completedNotes.map((n) => ({
    id: n.id,
    title: n.title,
    tags: n.tags,
    summary: n.short_summary,
    date: n.date,
    time: n.time,
    location: n.location ?? undefined,
    type: "diary" as const,
  }));

  // Group notes by date
  function groupByDate(noteList: Note[]) {
    const groups: { date: string; notes: Note[] }[] = [];
    for (const note of noteList) {
      const existing = groups.find((g) => g.date === note.date);
      if (existing) {
        existing.notes.push(note);
      } else {
        groups.push({ date: note.date, notes: [note] });
      }
    }
    return groups;
  }

  function getViewSubtitle(v: ViewMode): string {
    switch (v) {
      case "day":
        return "每条语音记录";
      case "week":
        return "AI 生成日报";
      case "month":
        return "AI 生成周报";
      case "year":
        return "AI 生成月报";
    }
  }

  const groups = groupByDate(displayNotes);

  return (
    <div className="px-4 pb-4">
      {/* View switcher */}
      <div className="flex items-center gap-1 mb-5 p-1 bg-secondary/60 rounded-xl">
        {VIEW_LABELS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn(
              "flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200",
              view === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Processing indicator */}
      <ProcessingIndicator count={processingCount} />

      {/* View subtitle */}
      <p className="text-[11px] text-muted-foreground mb-4 px-1">
        {getViewSubtitle(view)}
        <span className="ml-2 text-foreground/40">
          {"共 "}
          {displayNotes.length}
          {" 条"}
        </span>
      </p>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-4 bg-card border border-border/60 animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-3" />
              <div className="h-3 bg-secondary rounded w-1/3 mb-2" />
              <div className="h-3 bg-secondary rounded w-full" />
              <div className="h-3 bg-secondary rounded w-2/3 mt-1" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && displayNotes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-3">
            <span className="text-lg">0</span>
          </div>
          <p className="text-sm">暂无笔记</p>
          <p className="text-xs mt-1">长按底部按钮开始录音</p>
        </div>
      )}

      {/* Timeline */}
      {!loading && (
        <div>
          {groups.map((group) => (
            <div key={group.date}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-3 mt-2">
                <div className="w-5 flex justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                </div>
                <span className="text-xs font-semibold text-foreground/70 tracking-wide">
                  {group.date}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Notes in this group */}
              {group.notes.map((note) => {
                const globalIdx = displayNotes.findIndex((n) => n.id === note.id);
                const isLast = globalIdx === displayNotes.length - 1;
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isLast={isLast}
                    onClick={() => onNoteClick?.(note.id)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
