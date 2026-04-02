"use client";

import { useMemo, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MapPin, Clock, Trash2, X, CheckCircle2, Mic, Paperclip, MoreVertical, Pencil, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useNoteDetail } from "@/features/notes/hooks/use-note-detail";
import { MiniAudioPlayer } from "./mini-audio-player";
import { fabNotify } from "@/shared/lib/fab-notify";
import type { NoteItem } from "@/shared/lib/types";
import { InsightCard } from "./insight-card";
import { MarkdownContent } from "@/shared/components/markdown-content";
import { api } from "@/shared/lib/api";
import { fetchCognitiveStats, type CognitiveStats } from "@/shared/lib/api/cognitive";

interface NotesTimelineProps {
  filter?: string;
  notebook?: string | null;
  clusterId?: string | null;
  domainFilter?: string | null;
  onOpenChat?: (initial?: string) => void;
  onOpenOverlay?: (name: string) => void;
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

export function NotesTimeline({ filter, notebook, clusterId, domainFilter, onOpenChat, onOpenOverlay }: NotesTimelineProps) {
  const { notes, loading, deleteNotes, updateNote } = useNotes(notebook, clusterId);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Insight card: fetch top cluster for "路路发现"
  const [insightText, setInsightText] = useState<string | null>(null);
  useEffect(() => {
    fetchCognitiveStats()
      .then((stats) => {
        const top = stats.top_clusters?.[0];
        if (top) {
          setInsightText(
            `你最近在关注「${top.name}」，共 ${top.count} 条相关想法`,
          );
        }
      })
      .catch(() => { /* non-critical */ });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectionMode = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    await deleteNotes(Array.from(selectedIds));
    setDeleting(false);
    exitSelectionMode();
  }, [selectedIds, deleteNotes, exitSelectionMode]);

  const groups = useMemo(() => {
    let filtered = notes;
    if (filter && filter !== "全部") {
      filtered = filtered.filter((n) => n.tags.includes(filter));
    }
    // 维度筛选
    if (domainFilter) {
      filtered = filtered.filter((n) => n.domain === domainFilter);
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
  }, [notes, filter, domainFilter]);

  if (loading) {
    return (
      <div className="px-4 space-y-6 pt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-5 bg-card shadow-sm"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="h-2.5 animate-shimmer rounded w-20 mb-4" />
            <div className="h-3 animate-shimmer rounded w-full mb-2.5" />
            <div className="h-3 animate-shimmer rounded w-4/5 mb-2.5" style={{ animationDelay: "0.15s" }} />
            <div className="h-3 animate-shimmer rounded w-2/3" style={{ animationDelay: "0.3s" }} />
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8">
        {/* Animated waveform illustration */}
        <div className="relative w-40 h-20 mb-6">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/8 via-accent/5 to-primary/3" />
          <div className="absolute inset-0 flex items-center justify-center gap-[3px]">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-primary/25 animate-waveform"
                style={{
                  height: "12px",
                  animationDelay: `${i * 0.12}s`,
                  animationDuration: `${1.2 + Math.sin(i) * 0.4}s`,
                }}
              />
            ))}
          </div>
        </div>
        <p className="text-base font-display font-semibold text-foreground/80 mb-1.5">
          开始你的第一条记录
        </p>
        <p className="text-sm text-muted-foreground/60 text-center leading-relaxed">
          点击下方麦克风，用语音捕捉想法
        </p>
      </div>
    );
  }

  let cardIndex = 0;

  return (
    <>
      <div className="px-4 pt-2 pb-28">
        {groups.map((group, groupIdx) => (
          <div key={group.date} className="mb-8">
            {/* Day header — editorial style with serif date */}
            <div className="flex items-baseline gap-2 py-3">
              <span className="text-4xl font-serif-display text-foreground/80 leading-none tabular-nums">
                {group.day}
              </span>
              <span className="text-xs text-muted-foreground/60 tracking-wide">
                {group.monthWeekday}
              </span>
            </div>

            {/* Note cards */}
            <div className="space-y-6">
              {group.notes.map((note) => {
                const idx = cardIndex++;
                return (
                  <TimelineCard
                    key={note.id}
                    note={note}
                    index={idx}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(note.id)}
                    onToggleSelect={() => toggleSelect(note.id)}
                    onLongPress={() => enterSelectionMode(note.id)}
                    onDelete={() => deleteNotes([note.id])}
                    onUpdate={(fields) => updateNote(note.id, fields)}
                  />
                );
              })}
            </div>

            {/* Insert insight card after the first day group */}
            {groupIdx === 0 && insightText && (
              <div className="mt-6">
                <InsightCard
                  text={insightText}
                  onDetail={onOpenChat ? () => onOpenChat(`路路发现：${insightText}`) : undefined}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selection toolbar */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border pb-safe">
          <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={exitSelectionMode}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-secondary/60 transition-colors"
            >
              <X className="w-4 h-4" />
              <span className="text-sm">取消</span>
            </button>
            <span className="text-sm text-muted-foreground">
              已选择 {selectedIds.size} 条
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={selectedIds.size === 0 || deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">{deleting ? "删除中..." : "删除"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const LONG_PRESS_MS = 500;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function TimelineCard({
  note,
  index,
  selectionMode,
  selected,
  onToggleSelect,
  onLongPress,
  onDelete,
  onUpdate,
}: {
  note: NoteItem;
  index: number;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onLongPress?: () => void;
  onDelete: () => void;
  onUpdate: (fields: { short_summary: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { detail, loading: detailLoading } = useNoteDetail(expanded ? note.id : null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Menu & edit state
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // Related records (lazy load on expand)
  const [relatedRecords, setRelatedRecords] = useState<Array<{
    record_id: string; short_summary: string; relation: string;
  }> | null>(null);
  const relatedFetched = useRef(false);

  useEffect(() => {
    if (!expanded || relatedFetched.current) return;
    relatedFetched.current = true;
    api.get<{ related: Array<{ record_id: string; short_summary: string; relation: string }> }>(
      `/api/v1/records/${note.id}/related`,
    ).then((data) => {
      if (data.related?.length > 0) setRelatedRecords(data.related);
    }).catch(() => { /* non-critical */ });
  }, [expanded, note.id]);

  const handlePointerDown = useCallback(() => {
    longPressTriggered.current = false;
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress?.();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!longPressTriggered.current) {
      if (selectionMode) {
        onToggleSelect();
      } else {
        setExpanded((prev) => !prev);
      }
    }
  }, [selectionMode, onToggleSelect]);

  const handlePointerLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStartEdit = useCallback(() => {
    setEditText(note.short_summary || note.title);
    setEditing(true);
    setMenuPos(null);
  }, [note.short_summary, note.title]);

  const handleSaveEdit = useCallback(() => {
    if (editText.trim()) {
      onUpdate({ short_summary: editText.trim() });
    }
    setEditing(false);
  }, [editText, onUpdate]);

  const handleCopy = useCallback(() => {
    const text = note.short_summary || note.title;
    navigator.clipboard.writeText(text).then(() => fabNotify.info("已复制"));
    setMenuPos(null);
  }, [note.short_summary, note.title]);

  const handleDeleteSingle = useCallback(() => {
    setMenuPos(null);
    if (confirm("确定删除这条记录？")) {
      onDelete();
    }
  }, [onDelete]);

  // Only show skeleton if still processing AND no content available yet
  const hasContent = !!(note.short_summary || note.title !== "处理中...");
  const isProcessing = note.status !== "completed" && note.status !== "error" && note.status !== "failed" && !hasContent;

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
        <div className="space-y-2.5">
          <div className="h-3 animate-shimmer rounded w-3/4" />
          <div className="h-3 animate-shimmer rounded w-full" style={{ animationDelay: "0.1s" }} />
          <div className="h-3 animate-shimmer rounded w-2/3" style={{ animationDelay: "0.2s" }} />
        </div>
        <div className="flex items-center gap-1 mt-3 text-muted-foreground/60">
          <Clock className="w-3 h-3" />
          <span className="text-[11px] font-mono tabular-nums">{note.time}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={cn(
        "w-full rounded-2xl p-5 text-left transition-all duration-200 select-none",
        "hover:shadow-md active:scale-[0.98]",
        "bg-card shadow-sm",
        "animate-card-enter",
        selected && "ring-2 ring-primary bg-primary/5",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex gap-3">
        {/* Selection checkbox */}
        {selectionMode && (
          <div className="flex items-start pt-0.5 shrink-0">
            <CheckCircle2
              className={cn(
                "w-5 h-5 transition-colors",
                selected ? "text-primary" : "text-muted-foreground/40",
              )}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Meta row: time · duration/type · location · tags + menu button */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mb-2 flex-wrap">
            <span className="font-mono tabular-nums">{note.time}</span>
            {note.file_url ? (
              <>
                <span>·</span>
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[80px]">{note.file_name || "附件"}</span>
              </>
            ) : note.duration_seconds != null && note.duration_seconds > 0 ? (
              <>
                <span>·</span>
                <Mic className="w-3 h-3" />
                <span>{formatDuration(note.duration_seconds)}</span>
              </>
            ) : (
              <>
                <span>·</span>
                <Paperclip className="w-3 h-3" />
                <span>文字</span>
              </>
            )}
            {note.location && (
              <>
                <span>·</span>
                <MapPin className="w-3 h-3" />
                <span className="truncate max-w-[80px]">{note.location}</span>
              </>
            )}
            {note.tags.length > 0 && (
              <>
                <span>·</span>
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/80 text-[10px]"
                  >
                    {tag}
                  </span>
                ))}
              </>
            )}
            {/* Spacer + three-dot menu button */}
            {expanded && !selectionMode && (
              <>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPos({ x: rect.right - 160, y: rect.bottom + 4 });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  className="shrink-0 p-1 -mr-1 rounded-md hover:bg-secondary/60 transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground/60" />
                </button>
              </>
            )}
          </div>

          {/* Content — editing or display */}
          {editing ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full text-[15px] leading-[1.7] bg-secondary/30 rounded-lg p-2 border outline-none focus:ring-1 focus:ring-primary/40 resize-none min-h-[80px]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-lg"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-secondary/60"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className={cn(
              "text-[15px] leading-[1.7] text-foreground",
              !expanded && "line-clamp-4",
            )}>
              <MarkdownContent className="text-[15px] leading-[1.7]">
                {note.short_summary || note.title || ""}
              </MarkdownContent>
            </div>
          )}

          {/* Audio player */}
          {note.audio_path && !selectionMode && (
            <div className="mt-3">
              <MiniAudioPlayer recordId={note.id} />
            </div>
          )}

          {/* Expanded detail section */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3 animate-in fade-in slide-in-from-top-2">
              {detailLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground/60">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="text-xs">加载中...</span>
                </div>
              ) : detail && (
                <>
                  {/* Transcript / full content */}
                  {detail.transcript?.text && (
                    note.duration_seconds != null && note.duration_seconds > 0 ? (
                      /* 语音记录：显示"原文"标题 */
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">原文</h4>
                        <MarkdownContent className="text-sm text-foreground/70 leading-relaxed">
                          {detail.transcript.text}
                        </MarkdownContent>
                      </div>
                    ) : detail.transcript.text !== (note.short_summary || note.title) ? (
                      /* 文字记录：当 transcript 与摘要不同时显示完整内容 */
                      <div>
                        <MarkdownContent className="text-sm text-foreground/70 leading-relaxed">
                          {detail.transcript.text}
                        </MarkdownContent>
                      </div>
                    ) : null
                  )}
                  {/* Todos */}
                  {detail.todos.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">待办</h4>
                      {detail.todos.map((todo) => (
                        <div key={todo.id} className="flex items-center gap-2 py-0.5">
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border shrink-0",
                            todo.done ? "bg-primary border-primary" : "border-muted-foreground/30",
                          )} />
                          <span className={cn(
                            "text-sm",
                            todo.done && "line-through text-muted-foreground",
                          )}>
                            {todo.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Related records */}
                  {relatedRecords && relatedRecords.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1.5">相关记录</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {relatedRecords.map((r) => (
                          <span
                            key={r.record_id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary/60 rounded-full text-xs text-foreground/70 max-w-[200px]"
                          >
                            <span className="truncate">{r.short_summary}</span>
                            <span className="text-muted-foreground/50 shrink-0">·</span>
                            <span className="text-muted-foreground/60 shrink-0">{r.relation}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Popover menu — portal to body to escape transform containing block */}
      {menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setMenuPos(null)} />
          <div
            style={{
              position: "fixed",
              zIndex: 60,
              left: Math.min(menuPos.x, window.innerWidth - 160),
              top: Math.min(menuPos.y, window.innerHeight - 140),
            }}
            className="w-36 bg-background border rounded-xl shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              onClick={handleStartEdit}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              编辑
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
            >
              <Copy className="w-4 h-4" />
              复制
            </button>
            <button
              type="button"
              onClick={handleDeleteSingle}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
