"use client";

import { useState } from "react";
import { X, Check, Circle, Sparkles, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodos } from "@/features/todos/hooks/use-todos";
import { SwipeBack } from "@/shared/components/swipe-back";
import { ImpactDots } from "@/features/todos/components/impact-dots";
import { DOMAIN_CONFIG, getDomainStyle } from "@/features/todos/lib/domain-config";
import type { TodoItem } from "@/shared/lib/types";

interface TodoDiaryCardProps {
  onClose: () => void;
  onNoteClick?: (noteId: string) => void;
}

export function TodoDiaryCard({ onClose, onNoteClick }: TodoDiaryCardProps) {
  const { todos, loading, toggleTodo } = useTodos();
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());

  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const groupedByDomain = groupByDomain(pending);

  const handleToggle = (id: string, isDone: boolean) => {
    if (!isDone) {
      setJustCompleted((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setJustCompleted((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 600);
    }
    toggleTodo(id);
  };

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header — PPT style */}
        <div className="relative px-4 py-4 border-b-2 border-border">
          <div
            className="absolute inset-0 opacity-30"
            style={{ background: `linear-gradient(135deg, hsl(var(--domain-highlight-bg)), transparent 60%)` }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">待办事项</h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-xs font-semibold"
                  style={{ color: "hsl(var(--domain-work-fg))", backgroundColor: "hsl(var(--domain-work-bg))" }}
                >
                  {pending.length} 待办
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-xs text-muted-foreground bg-secondary">
                  {done.length} 完成
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Loading — shimmer */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl todo-card-ppt">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full animate-shimmer" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 animate-shimmer rounded w-3/4" />
                      <div className="h-3 animate-shimmer rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state — warm yellow highlight */}
          {!loading && todos.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-12 rounded-xl todo-card-ppt"
              style={{ borderColor: "hsl(var(--domain-highlight))" }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ backgroundColor: "hsl(var(--domain-highlight-bg))" }}
              >
                <ListChecks className="w-6 h-6" style={{ color: "hsl(var(--domain-highlight))" }} />
              </div>
              <p className="text-sm font-display font-semibold text-foreground">暂无待办</p>
              <p className="text-xs text-muted-foreground mt-1">录音中提到的任务会自动出现在这里</p>
            </div>
          )}

          {/* Domain groups */}
          {!loading && Object.entries(groupedByDomain).map(([domain, items]) => {
            const { config, fgStyle } = getDomainStyle(domain);
            const DomainIcon = config.icon;
            return (
              <div key={domain} className="mb-6">
                {/* Domain group header */}
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div
                    className="w-4 h-4 rounded-sm"
                    style={{ backgroundColor: fgStyle.color }}
                  />
                  <h3 className="font-display font-semibold text-sm text-foreground">
                    {config.label}
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {items.length}
                  </span>
                  <div
                    className="flex-1 h-px ml-1"
                    style={{ backgroundColor: `${fgStyle.color}` , opacity: 0.2 }}
                  />
                </div>

                {/* Todo cards */}
                <div className="space-y-2">
                  {items.map((todo) => {
                    const animating = justCompleted.has(todo.id);
                    return (
                      <div
                        key={todo.id}
                        className={cn(
                          "relative flex items-start gap-3 p-3 bg-card todo-card-ppt overflow-hidden transition-all duration-400",
                          animating && "bg-muted/50",
                        )}
                        style={{
                          borderColor: `hsl(var(${getDomainStyle(todo.domain).config.fgVar}) / 0.3)`,
                        }}
                      >
                        {/* Left domain color bar */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                          style={{ backgroundColor: fgStyle.color }}
                        />

                        {/* Check circle */}
                        <button
                          type="button"
                          onClick={() => handleToggle(todo.id, todo.done)}
                          className={cn("mt-0.5 flex-shrink-0 pl-1", animating && "animate-todo-check-circle")}
                        >
                          <Circle className="w-5 h-5" style={{ color: `${fgStyle.color}80` }} />
                        </button>

                        {/* Content */}
                        <button
                          type="button"
                          onClick={() => onNoteClick?.(todo.record_id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <p className={cn(
                              "text-sm text-foreground leading-snug flex-1",
                              animating && "animate-todo-strikethrough text-muted-foreground",
                            )}>
                              {todo.text}
                            </p>
                            {todo.ai_actionable && (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                                style={{ backgroundColor: "hsl(var(--domain-highlight-bg))" }}
                              >
                                <Sparkles className="w-3 h-3" style={{ color: "hsl(var(--domain-highlight))" }} />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 mt-1.5">
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {new Date(todo.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {(todo.impact ?? 5) >= 5 && (
                              <ImpactDots impact={todo.impact ?? 5} domain={todo.domain} />
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Completed section */}
          {!loading && done.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <h3 className="text-xs font-display font-semibold text-muted-foreground mb-2.5">
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
                      onClick={() => handleToggle(todo.id, todo.done)}
                      className="mt-0.5 flex-shrink-0 pl-1"
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
                  <p className="text-xs text-muted-foreground text-center py-2 font-mono">
                    +{done.length - 10} 项
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SwipeBack>
  );
}

function groupByDomain(items: TodoItem[]): Record<string, TodoItem[]> {
  const groups: Record<string, TodoItem[]> = {};
  const sorted = [...items].sort((a, b) => {
    const scoreA = (a.impact ?? 5) * 2;
    const scoreB = (b.impact ?? 5) * 2;
    return scoreB - scoreA;
  });
  for (const item of sorted) {
    const domain = item.domain ?? "work";
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(item);
  }
  return groups;
}
