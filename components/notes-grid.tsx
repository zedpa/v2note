"use client";

import { useState, useCallback } from "react";
import { NoteCard } from "./note-card";
import type { Note } from "./note-card";
import { SelectionToolbar } from "./selection-toolbar";
import { ReportGenerator } from "./report-generator";
import { useNotes } from "@/hooks/use-notes";
import { cn } from "@/lib/utils";
import type { ReportPeriod } from "@/hooks/use-report";

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
  const [showReport, setShowReport] = useState(false);
  const { notes, loading, deleteNotes, archiveNotes } = useNotes();

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter by tag (only apply tag filter to completed notes; always show processing ones)
  const filtered =
    activeFilter === "全部"
      ? notes
      : notes.filter((n) =>
          n.status !== "completed" ||
          n.tags.some(
            (tag) => tag === activeFilter || tag.toLowerCase() === activeFilter.toLowerCase(),
          ),
        );

  // Convert NoteItem to Note format for NoteCard (include all statuses)
  const displayNotes: Note[] = filtered.map((n) => ({
    id: n.id,
    title: n.title,
    tags: n.tags,
    summary: n.short_summary,
    date: n.date,
    time: n.time,
    location: n.location ?? undefined,
    type: "diary" as const,
    status: n.status,
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

  const handleLongPress = useCallback((noteId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([noteId]));
  }, []);

  const handleToggleSelect = useCallback((noteId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      // Exit selection mode if nothing selected
      if (next.size === 0) {
        setSelectionMode(false);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(displayNotes.map((n) => n.id)));
  }, [displayNotes]);

  const handleDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setSelectionMode(false);
    setSelectedIds(new Set());
    await deleteNotes(ids);
  }, [selectedIds, deleteNotes]);

  const handleArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setSelectionMode(false);
    setSelectedIds(new Set());
    await archiveNotes(ids);
  }, [selectedIds, archiveNotes]);

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const groups = groupByDate(displayNotes);

  return (
    <div>
      {/* Selection toolbar */}
      {selectionMode && (
        <SelectionToolbar
          selectedCount={selectedIds.size}
          onSelectAll={handleSelectAll}
          onDelete={handleDelete}
          onArchive={handleArchive}
          onCancel={handleCancelSelection}
        />
      )}

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

        {/* View subtitle + report button */}
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="text-[11px] text-muted-foreground">
            {getViewSubtitle(view)}
            <span className="ml-2 text-foreground/40">
              {"共 "}
              {displayNotes.length}
              {" 条"}
            </span>
          </p>
          {view !== "day" && (
            <button
              type="button"
              onClick={() => setShowReport(true)}
              className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              生成{view === "week" ? "周" : view === "month" ? "月" : "年"}报
            </button>
          )}
        </div>

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
                      selected={selectedIds.has(note.id)}
                      selectionMode={selectionMode}
                      onLongPress={() => handleLongPress(note.id)}
                      onToggleSelect={() => handleToggleSelect(note.id)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report generator overlay */}
      {showReport && (
        <ReportGenerator
          defaultPeriod={
            view === "week" ? "weekly" : view === "month" ? "monthly" : view === "year" ? "yearly" : "daily"
          }
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
