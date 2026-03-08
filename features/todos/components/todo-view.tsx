"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodos } from "@/features/todos/hooks/use-todos";
import { getDomainStyle } from "@/features/todos/lib/domain-config";

export function TodoView() {
  const { todos, loading, toggleTodo } = useTodos();

  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">待办事项</h2>
          {/* Warm yellow underline decoration */}
          <div
            className="h-0.5 mt-1 rounded-full"
            style={{
              width: "60%",
              backgroundColor: "hsl(var(--domain-highlight))",
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {pending.length} 项待办
        </span>
      </div>

      {/* Loading — shimmer */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-xl todo-card-ppt">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full animate-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 animate-shimmer rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && todos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: "hsl(var(--domain-highlight-bg))" }}
          >
            <Check className="w-5 h-5" style={{ color: "hsl(var(--domain-highlight))" }} />
          </div>
          <p className="text-sm font-display font-semibold">暂无待办</p>
          <p className="text-xs mt-1">录音中提到的任务会自动出现在这里</p>
        </div>
      )}

      {/* Pending */}
      {!loading && (
        <div className="space-y-2">
          {pending.map((todo) => {
            const { fgStyle, borderStyle } = getDomainStyle(todo.domain);
            return (
              <button
                type="button"
                key={todo.id}
                onClick={() => toggleTodo(todo.id)}
                className="flex items-start gap-3 w-full p-3 rounded-xl bg-card border text-left hover:bg-secondary/50 transition-colors"
                style={{ borderColor: `${fgStyle.color}4D` }}
              >
                <div className="flex items-center gap-2 mt-0.5 flex-shrink-0">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: fgStyle.color }}
                  />
                  <Circle className="w-5 h-5" style={{ color: `${fgStyle.color}66` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">
                    {todo.text}
                  </p>
                  {todo.source && (
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                      {todo.source}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {!loading && done.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-muted-foreground mb-2 font-display font-semibold">
            已完成 ({done.length})
          </p>
          <div className="space-y-2">
            {done.map((todo) => (
              <button
                type="button"
                key={todo.id}
                onClick={() => toggleTodo(todo.id)}
                className="flex items-start gap-3 w-full p-3 rounded-xl bg-secondary/30 text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center justify-center w-5 h-5 mt-0.5 rounded-full bg-primary/15 flex-shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground line-through leading-snug">
                    {todo.text}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
