"use client";

import { X, Clock, MapPin, Tag, CheckSquare, Lightbulb, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNoteDetail } from "@/hooks/use-note-detail";
import { SwipeBack } from "./swipe-back";

interface NoteDetailProps {
  recordId: string;
  onClose: () => void;
}

export function NoteDetail({ recordId, onClose }: NoteDetailProps) {
  const { detail, loading } = useNoteDetail(recordId);

  if (loading) {
    return (
      <SwipeBack onClose={onClose}>
        <div className="flex items-center justify-between p-4">
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 space-y-4 animate-pulse">
          <div className="h-6 bg-secondary rounded w-3/4" />
          <div className="h-4 bg-secondary rounded w-1/2" />
          <div className="h-20 bg-secondary rounded" />
        </div>
      </SwipeBack>
    );
  }

  if (!detail) return null;

  const { record, transcript, summary, tags, todos, ideas } = detail;
  const dt = new Date(record.created_at);
  const dateStr = `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
  const timeStr = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

  return (
    <SwipeBack onClose={onClose}>
      {/* Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 flex items-center justify-between p-4 border-b border-border/50">
        <button type="button" onClick={onClose} className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
        <span className="text-xs text-muted-foreground">{dateStr}</span>
      </div>

      <div className="px-4 py-6 space-y-6 pb-20">
        {/* Title */}
        <h1 className="text-xl font-bold text-foreground">
          {summary?.title ?? "未命名笔记"}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">{timeStr}</span>
          </div>
          {record.location_text && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span className="text-xs">{record.location_text}</span>
            </div>
          )}
          {record.duration_seconds && (
            <span className="text-xs">
              {Math.floor(record.duration_seconds / 60)}分{record.duration_seconds % 60}秒
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="p-4 rounded-2xl bg-card border border-border/60">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-accent">AI 摘要</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {summary.short_summary}
            </p>
          </div>
        )}

        {/* Transcript */}
        {transcript && transcript.text && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">转录原文</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {transcript.text}
            </p>
          </div>
        )}

        {/* Todos */}
        {todos.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">待办事项</h3>
            </div>
            <div className="space-y-2">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg",
                    todo.done ? "opacity-50" : "",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center",
                      todo.done
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {todo.done && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-primary-foreground">
                        <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm",
                      todo.done ? "line-through text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {todo.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ideas */}
        {ideas.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">想法与灵感</h3>
            </div>
            <div className="space-y-2">
              {ideas.map((idea) => (
                <div
                  key={idea.id}
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30"
                >
                  <p className="text-sm text-foreground">{idea.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SwipeBack>
  );
}
