"use client";

import { useState } from "react";
import { X, Clock, MapPin, Tag, CheckSquare, Lightbulb, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNoteDetail } from "@/hooks/use-note-detail";
import { useNoteEditor } from "@/hooks/use-note-editor";
import { SwipeBack } from "./swipe-back";

interface NoteDetailProps {
  recordId: string;
  onClose: () => void;
}

export function NoteDetail({ recordId, onClose }: NoteDetailProps) {
  const { detail, loading, refetch } = useNoteDetail(recordId);
  const editor = useNoteEditor(detail, refetch);

  // Inline edit state
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [newIdea, setNewIdea] = useState("");

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
        {/* Title — editable */}
        {editor.editing === "title" ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 text-xl font-bold bg-secondary rounded-xl px-3 py-2 outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => editor.saveTitle(editTitle)}
              className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm"
            >
              保存
            </button>
            <button
              type="button"
              onClick={editor.cancelEdit}
              className="px-3 py-2 rounded-xl bg-secondary text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2 group">
            <h1 className="text-xl font-bold text-foreground flex-1">
              {summary?.title ?? "未命名笔记"}
            </h1>
            <button
              type="button"
              onClick={() => { setEditTitle(summary?.title ?? ""); editor.startEdit("title"); }}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        )}

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
              <span className="text-xs font-semibold text-accent">AI 摘要</span>
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

        {/* Transcript */}
        {transcript && transcript.text && (
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

        {/* Ideas — editable */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">想法与灵感</h3>
          </div>
          <div className="space-y-2">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 group flex items-start gap-2"
              >
                <p className="text-sm text-foreground flex-1">{idea.text}</p>
                <button
                  type="button"
                  onClick={() => editor.deleteIdea(idea.id)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              </div>
            ))}
            {/* Add idea inline */}
            <div className="flex items-center gap-2 p-2">
              <Plus className="w-4 h-4 text-amber-400/40" />
              <input
                type="text"
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newIdea.trim()) {
                    editor.addIdea(newIdea.trim());
                    setNewIdea("");
                  }
                }}
                placeholder="添加灵感..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>
        </div>
      </div>
    </SwipeBack>
  );
}
