"use client";

import { useState } from "react";
import { X, Clock, MapPin, Tag, CheckSquare, FileText, Pencil, Plus, Trash2, ExternalLink, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/shared/lib/api";
import { useNoteDetail } from "@/features/notes/hooks/use-note-detail";
import { useNoteEditor } from "@/features/notes/hooks/use-note-editor";
import { SwipeBack } from "@/shared/components/swipe-back";

/** file_url 是否为图片 */
function isImageUrl(url: string): boolean {
  if (url.startsWith("data:image")) return true;
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url);
}

interface NoteDetailProps {
  recordId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function NoteDetail({ recordId, onClose, onDeleted }: NoteDetailProps) {
  const { detail, loading, refetch } = useNoteDetail(recordId);
  const editor = useNoteEditor(detail, refetch);

  // Inline edit state
  const [editSummary, setEditSummary] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newTodo, setNewTodo] = useState("");

  if (loading) {
    return (
      <SwipeBack onClose={onClose}>
        <div className="flex items-center justify-between p-4 pt-safe">
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

  const { record, transcript, summary, tags, todos } = detail;
  const isTextNote = record.duration_seconds == null || record.duration_seconds === 0;
  const dt = new Date(record.created_at);
  const dateStr = `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
  const timeStr = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

  const handleDelete = async () => {
    if (!confirm("确定删除这条笔记吗？")) return;
    try {
      await api.delete("/api/v1/records", { ids: [recordId] });
      onDeleted?.();
      onClose();
    } catch {
      // silently fail
    }
  };

  return (
    <SwipeBack onClose={onClose}>
      {/* Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 pt-safe border-b border-border/50">
        <div className="flex items-center justify-between p-4">
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{dateStr}</span>
            <button type="button" onClick={handleDelete} className="p-2 rounded-xl hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6 pb-20">
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
          {record.duration_seconds != null && record.duration_seconds > 0 && (
            <span className="text-xs">
              {Math.floor(record.duration_seconds / 60)}分{record.duration_seconds % 60}秒
            </span>
          )}
        </div>

        {/* Attachment preview */}
        {record.file_url && (
          isImageUrl(record.file_url) ? (
            <a href={record.file_url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={record.file_url}
                alt={record.file_name || "附件图片"}
                className="w-full max-h-[300px] object-cover rounded-2xl bg-secondary"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {record.file_name && (
                <p className="text-xs text-muted-foreground mt-1.5">{record.file_name}</p>
              )}
            </a>
          ) : (
            <a
              href={record.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60 hover:bg-secondary/60 transition-colors"
            >
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                {record.file_name || "附件"}
              </span>
              <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
            </a>
          )
        )}

        {/* Tags — editable */}
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          {tags.map((tag) => (
            <button
              type="button"
              key={tag.id}
              onClick={() => editor.removeTag(tag.id)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="点击移除"
            >
              {tag.name} &times;
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  editor.addTag(newTag.trim());
                  setNewTag("");
                }
              }}
              placeholder="+ 标签"
              className="w-16 text-[11px] px-2 py-1 rounded-full bg-secondary outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Summary — editable */}
        {summary && (
          <div className="p-4 rounded-2xl bg-card border border-border/60">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-accent">{isTextNote ? "笔记内容" : "AI 转写"}</span>
              {editor.editing !== "summary" && (
                <button
                  type="button"
                  onClick={() => { setEditSummary(summary.short_summary); editor.startEdit("summary"); }}
                  className="ml-auto p-1 rounded-lg hover:bg-secondary transition-colors"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
            {editor.editing === "summary" ? (
              <div className="space-y-2">
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  rows={4}
                  className="w-full text-sm bg-secondary rounded-xl px-3 py-2 outline-none resize-none leading-relaxed"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => editor.saveSummary(editSummary)}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={editor.cancelEdit}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-xs"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {summary.short_summary}
              </p>
            )}
          </div>
        )}

        {/* Transcript — hide for text notes */}
        {!isTextNote && transcript && transcript.text && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">转录原文</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {transcript.text}
            </p>
          </div>
        )}

        {/* Todos — editable */}
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
                  "flex items-start gap-2 p-2 rounded-lg group",
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
                    "text-sm flex-1",
                    todo.done ? "line-through text-muted-foreground" : "text-foreground",
                  )}
                >
                  {todo.text}
                </span>
                <button
                  type="button"
                  onClick={() => editor.deleteTodo(todo.id)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              </div>
            ))}
            {/* Add todo inline */}
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-muted-foreground/40" />
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTodo.trim()) {
                    editor.addTodo(newTodo.trim());
                    setNewTodo("");
                  }
                }}
                placeholder="添加待办..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>
        </div>

      </div>
    </SwipeBack>
  );
}
