"use client";

import { X, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodos } from "@/features/todos/hooks/use-todos";

interface TodoDiaryCardProps {
  onClose: () => void;
  onNoteClick?: (noteId: string) => void;
}

export function TodoDiaryCard({ onClose, onNoteClick }: TodoDiaryCardProps) {
  const { todos, loading, toggleTodo } = useTodos();

  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  // Group by date
  const groupedPending = groupByDate(pending);
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-safe">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div>
          <h1 className="text-lg font-bold text-foreground">待办事项</h1>
          <p className="text-xs text-muted-foreground">
            {pending.length} 项待办 / {done.length} 项已完成
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-card border border-border/50 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-secondary" />
                  <div className="flex-1">
                    <div className="h-4 bg-secondary rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && todos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-3">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-sm">暂无待办</p>
            <p className="text-xs mt-1">录音中提到的任务会自动出现在这里</p>
          </div>
        )}

        {!loading && Object.entries(groupedPending).map(([date, items]) => (
          <div key={date} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                {date === today ? "今天" : formatDateLabel(date)}
              </h3>
              <span className="text-[10px] text-muted-foreground/60">
                {items.length} 项
              </span>
            </div>
            <div className="space-y-1.5">
              {items.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border/50 hover:bg-secondary/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    <Circle className="w-5 h-5 text-primary/40" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNoteClick?.(todo.record_id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm text-foreground leading-snug">
                      {todo.text}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(todo.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Completed section */}
        {!loading && done.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">
              已完成 ({done.length})
            </h3>
            <div className="space-y-1.5">
              {done.slice(0, 10).map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                  </button>
                  <p className="text-sm text-muted-foreground line-through leading-snug flex-1">
                    {todo.text}
                  </p>
                </div>
              ))}
              {done.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  还有 {done.length - 10} 项已完成
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function groupByDate(items: Array<{ created_at: string; [key: string]: any }>): Record<string, typeof items> {
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const date = item.created_at.split("T")[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  }
  return groups;
}

function formatDateLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 1) return "昨天";
  if (diff === 2) return "前天";
  if (diff < 7) return `${diff} 天前`;

  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
