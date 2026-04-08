"use client";

import { useMemo, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MapPin, Clock, Trash2, X, CheckCircle2, Mic, Paperclip, MoreVertical, Pencil, Copy, RotateCcw, AlertTriangle, HardDrive, Bot, Globe, Quote, ChevronUp, ChevronRight, FileText, Image as ImageIcon, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useNoteDetail } from "@/features/notes/hooks/use-note-detail";
import { MiniAudioPlayer } from "./mini-audio-player";
import { fabNotify } from "@/shared/lib/fab-notify";
import { getAudioByRecordId, deleteAudio, addWavHeader, type PendingAudio } from "@/features/recording/lib/audio-cache";
import { retryRecordAudio, deleteRecords } from "@/shared/lib/api/records";
import type { NoteItem } from "@/shared/lib/types";
import { useConfirmDialog } from "@/shared/components/confirm-dialog";
import { InsightCard } from "./insight-card";
import { MarkdownContent } from "@/shared/components/markdown-content";
import { api } from "@/shared/lib/api";
import { fetchCognitiveStats, type CognitiveStats } from "@/shared/lib/api/cognitive";

interface NotesTimelineProps {
  filter?: string;
  notebook?: string | null;
  domainFilter?: string | null;
  onOpenChat?: (initial?: string) => void;
  onOpenOverlay?: (name: string) => void;
  /** 注册刷新函数，供父组件调用（下拉刷新） */
  onRegisterRefresh?: (fn: () => Promise<boolean>) => void;
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

export function NotesTimeline({ filter, notebook, domainFilter, onOpenChat, onOpenOverlay, onRegisterRefresh }: NotesTimelineProps) {
  const { notes, loading, deleteNotes, updateNote, refetch } = useNotes(notebook);

  // 注册刷新函数供父组件调用（下拉刷新）
  useEffect(() => {
    onRegisterRefresh?.(() => refetch(true));
  }, [onRegisterRefresh, refetch]);
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
    // 维度筛选（前缀匹配：选"工作"会匹配"工作"和"工作/v2note"）
    if (domainFilter) {
      filtered = filtered.filter((n) =>
        n.domain === domainFilter || n.domain?.startsWith(domainFilter + "/"),
      );
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
        <div className="fixed left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border pb-safe" style={{ bottom: "var(--kb-offset, 0px)", transition: "bottom 150ms ease-out" }}>
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
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Menu & edit state
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // Related records (lazy load on expand)
  const [relatedRecords, setRelatedRecords] = useState<Array<{
    record_id: string; short_summary: string; relation: string;
  }> | null>(null);
  const relatedFetched = useRef(false);

  // 原文展开状态（录音/附件卡片内的原文面板）
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // 图片查看器 & 长按菜单
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const imgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 检测正文是否被 line-clamp 截断
  const contentRef = useRef<HTMLDivElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const canExpandRef = useRef(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;
    setIsClamped(el.scrollHeight > el.clientHeight + 2);
  }, [note.short_summary, note.title, expanded]);

  // 清理图片长按 timer
  useEffect(() => {
    return () => { if (imgTimerRef.current) clearTimeout(imgTimerRef.current); };
  }, []);

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
      } else if (canExpandRef.current) {
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

  const handleDeleteSingle = useCallback(async () => {
    setMenuPos(null);
    const ok = await confirm({ description: "确定删除这条记录？", confirmText: "删除", destructive: true });
    if (ok) onDelete();
  }, [onDelete, confirm]);

  // pending_retry: 录音未处理，显示播放条+重试按钮
  const [retrying, setRetrying] = useState(false);
  const [localCache, setLocalCache] = useState<PendingAudio | null>(null);
  const localCacheFetched = useRef(false);

  // 检查是否有本地缓存（pending_retry 时立即查，展开时也查）
  useEffect(() => {
    if (localCacheFetched.current) return;
    if (note.status === "pending_retry" || expanded) {
      localCacheFetched.current = true;
      getAudioByRecordId(note.id).then((cache) => {
        if (cache) setLocalCache(cache);
      }).catch(() => {});
    }
  }, [note.id, note.status, expanded]);

  const handleRetry = useCallback(async () => {
    if (!localCache || retrying) return;
    setRetrying(true);
    try {
      const wavData = addWavHeader(localCache.pcmData);
      await retryRecordAudio(note.id, wavData);
      fabNotify.success("重试成功，正在处理");
      // 会通过 process.result WS 消息刷新
    } catch (err: any) {
      fabNotify.error("重试失败: " + (err.message || "请检查网络"));
    } finally {
      setRetrying(false);
    }
  }, [localCache, retrying, note.id]);

  const handleDeleteLocalAudio = useCallback(async () => {
    if (!localCache) return;
    if (note.status === "pending_retry") {
      // 未处理的录音：确认后删除缓存+record
      const ok = await confirm({ description: "该录音尚未处理，删除后无法恢复，确定？", confirmText: "删除", destructive: true });
      if (!ok) return;
      try {
        await deleteAudio(localCache.id);
        await deleteRecords([note.id]);
        onDelete();
        fabNotify.info("已删除");
      } catch {
        fabNotify.error("删除失败");
      }
    } else {
      // 已处理的录音：仅删缓存
      try {
        await deleteAudio(localCache.id);
        setLocalCache(null);
        fabNotify.info("本地录音已清除");
      } catch {
        fabNotify.error("清除失败");
      }
    }
    setMenuPos(null);
  }, [localCache, note.id, note.status, onDelete]);

  if (note.status === "pending_retry") {
    return (
      <>
        <div
          className="rounded-2xl p-5 bg-card shadow-sm border border-orange-200/50 animate-card-enter"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-orange-600 font-medium">录音未处理</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying || !localCache}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 transition-opacity"
            >
              {retrying ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              {retrying ? "重试中..." : "重试"}
            </button>
          </div>
          {localCache && (
            <MiniAudioPlayer recordId={note.id} localPcmData={localCache.pcmData} />
          )}
          <div className="flex items-center gap-1.5 mt-3 text-muted-foreground/60">
            <Clock className="w-3 h-3" />
            <span className="text-[11px] font-mono tabular-nums">{note.time}</span>
            {note.duration_seconds != null && note.duration_seconds > 0 && (
              <>
                <span>·</span>
                <Mic className="w-3 h-3" />
                <span className="text-[11px]">{formatDuration(note.duration_seconds)}</span>
              </>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={handleDeleteLocalAudio}
              className="text-[11px] text-destructive/60 hover:text-destructive transition-colors"
            >
              删除
            </button>
          </div>
        </div>
        <ConfirmDialog />
      </>
    );
  }

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

  // 判断来源类型
  const isVoice = !!(note.audio_path || (note.duration_seconds != null && note.duration_seconds > 0));
  const isImage = note.source === "image" || (note.file_url && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(note.file_url));
  const isFile = !!(note.file_url && !isImage);

  // 有附加内容（录音/附件/图片）或正文被截断时才可展开
  const canExpand = isVoice || isFile || isImage || isClamped;
  canExpandRef.current = canExpand;

  return (
    <div
      data-testid="timeline-card"
      role="button"
      tabIndex={0}
      onPointerDown={!expanded ? handlePointerDown : undefined}
      onPointerUp={!expanded ? handlePointerUp : undefined}
      onPointerLeave={!expanded ? handlePointerLeave : undefined}
      className={cn(
        "w-full rounded-2xl p-5 text-left transition-all duration-200 select-none",
        !expanded && "hover:shadow-md active:scale-[0.98]",
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
            {(note.source === "chat" || note.source === "chat_tool") ? (
              <>
                <span>·</span>
                <Bot className="w-3 h-3 text-primary/70" />
                <span>AI</span>
              </>
            ) : isFile ? (
              <>
                <span>·</span>
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[80px]">{note.file_name || "附件"}</span>
              </>
            ) : isImage ? (
              <>
                <span>·</span>
                <ImageIcon className="w-3 h-3 text-blue-500/70" />
                <span>图片</span>
              </>
            ) : note.source === "url" ? (
              <>
                <span>·</span>
                <Globe className="w-3 h-3 text-blue-500/70" />
                <span>网页</span>
              </>
            ) : note.source_type === "material" ? (
              <>
                <span>·</span>
                <Quote className="w-3 h-3 text-amber-500/70" />
                <span>摘录</span>
              </>
            ) : isVoice ? (
              <>
                <span>·</span>
                <Mic className="w-3 h-3" />
                <span>{formatDuration(note.duration_seconds!)}</span>
              </>
            ) : null}
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
            {!selectionMode && (
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
          <div data-testid="card-content">
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
              <>
                {/* 正文摘要 */}
                {(note.short_summary || note.title) && (
                  <div
                    ref={contentRef}
                    className={cn(
                      "text-[15px] leading-[1.7] text-foreground",
                      !expanded && "line-clamp-4",
                    )}
                  >
                    <MarkdownContent className="text-[15px] leading-[1.7]">
                      {note.short_summary || note.title || ""}
                    </MarkdownContent>
                  </div>
                )}

                {/* 图片缩略图 */}
                {isImage && note.file_url && (
                  <div className="mt-3" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
                    <img
                      data-testid="image-thumbnail"
                      src={note.file_url}
                      alt=""
                      className="rounded-lg max-h-40 object-cover cursor-pointer"
                      onClick={() => setImageViewerOpen(true)}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        imgTimerRef.current = setTimeout(() => {
                          setImageMenuOpen(true);
                        }, 500);
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        if (imgTimerRef.current) {
                          clearTimeout(imgTimerRef.current);
                          imgTimerRef.current = null;
                        }
                      }}
                      onPointerLeave={() => {
                        if (imgTimerRef.current) {
                          clearTimeout(imgTimerRef.current);
                          imgTimerRef.current = null;
                        }
                      }}
                    />
                  </div>
                )}

                {/* 录音卡片 — flomo 风格 */}
                {isVoice && !selectionMode && (
                  <div
                    data-testid="recording-card"
                    className="mt-3 rounded-xl bg-secondary/40 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <MiniAudioPlayer recordId={note.id} localPcmData={localCache?.pcmData} />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!expanded) setExpanded(true);
                          setTranscriptOpen((prev) => !prev);
                        }}
                        className="flex items-center gap-0.5 shrink-0 text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                      >
                        原文
                        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", transcriptOpen && "rotate-90")} />
                      </button>
                    </div>
                    {/* 原文展开面板 */}
                    {transcriptOpen && (
                      <div data-testid="transcript-panel" className="px-3 pb-3 animate-in fade-in slide-in-from-top-1">
                        <div className="border-t border-border/30 pt-2.5">
                          {detailLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground/60">
                              <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              <span className="text-xs">加载原文...</span>
                            </div>
                          ) : detail?.transcript?.text ? (
                            <MarkdownContent className="text-sm text-foreground/70 leading-relaxed">
                              {detail.transcript.text}
                            </MarkdownContent>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">暂无原文</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 附件卡片 — 非图片文件 */}
                {isFile && !selectionMode && (
                  <div
                    data-testid="attachment-card"
                    className="mt-3 rounded-xl bg-secondary/40 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <FileText className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                      <span data-testid="file-name" className="text-sm text-foreground/80 truncate flex-1">
                        {note.file_name || "文件"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!expanded) setExpanded(true);
                          setTranscriptOpen((prev) => !prev);
                        }}
                        disabled={expanded && !detailLoading && detail != null && !detail.transcript?.text}
                        className="flex items-center gap-0.5 shrink-0 text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors disabled:text-muted-foreground/40 disabled:hover:bg-transparent"
                      >
                        原文
                        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", transcriptOpen && "rotate-90")} />
                      </button>
                    </div>
                    {transcriptOpen && (
                      <div data-testid="transcript-panel" className="px-3 pb-3 animate-in fade-in slide-in-from-top-1">
                        <div className="border-t border-border/30 pt-2.5">
                          {detailLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground/60">
                              <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              <span className="text-xs">加载原文...</span>
                            </div>
                          ) : detail?.transcript?.text ? (
                            <MarkdownContent className="text-sm text-foreground/70 leading-relaxed">
                              {detail.transcript.text}
                            </MarkdownContent>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">暂无原文</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

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
              {/* 收起按钮 — 展开态底部 */}
              <div className="flex justify-center pt-1">
                <button
                  data-testid="collapse-button"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                    setTranscriptOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-full text-xs text-muted-foreground hover:bg-secondary/60 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  收起
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 图片全屏查看器 */}
      {imageViewerOpen && note.file_url && createPortal(
        <div
          data-testid="image-viewer"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setImageViewerOpen(false)}
        >
          <img
            src={note.file_url}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            onClick={() => setImageViewerOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>,
        document.body,
      )}

      {/* 图片管理菜单 */}
      {imageMenuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setImageMenuOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-60 bg-background rounded-t-2xl shadow-xl pb-safe animate-in slide-in-from-bottom">
            <div className="py-2">
              <button
                type="button"
                onClick={() => {
                  if (note.file_url) {
                    const a = document.createElement("a");
                    a.href = note.file_url;
                    a.download = note.file_name || "image";
                    a.click();
                  }
                  setImageMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-secondary/60 transition-colors"
              >
                <Save className="w-5 h-5 text-muted-foreground" />
                保存到相册
              </button>
              <button
                type="button"
                onClick={async () => {
                  setImageMenuOpen(false);
                  const ok = await confirm({ description: "确定删除这张图片？", confirmText: "删除", destructive: true });
                  if (ok) onDelete();
                }}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                删除图片
              </button>
              <button
                type="button"
                onClick={() => setImageMenuOpen(false)}
                className="w-full py-3 text-sm text-muted-foreground text-center border-t border-border/50 mt-1"
              >
                取消
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

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
            {localCache && (
              <button
                type="button"
                onClick={handleDeleteLocalAudio}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 transition-colors"
              >
                <HardDrive className="w-4 h-4" />
                删除本地录音
              </button>
            )}
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
      <ConfirmDialog />
    </div>
  );
}
