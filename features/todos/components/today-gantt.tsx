"use client";

import { X, Circle, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayTodos, type TodayTodo } from "@/features/todos/hooks/use-today-todos";
import { SwipeBack } from "@/shared/components/swipe-back";

interface TodayGanttProps {
  onClose: () => void;
}

// Time slots: 6am - 11pm
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

export function TodayGantt({ onClose }: TodayGanttProps) {
  const { todos, loading, toggleTodo } = useTodayTodos();

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();

  // Calculate the position of the "now" indicator
  const nowOffset = ((currentHour - 6) * 60 + currentMinutes) / (18 * 60);

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div>
            <h1 className="text-lg font-bold text-foreground">今日任务</h1>
            <p className="text-xs text-muted-foreground">
              {now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
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
        <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-muted-foreground">加载中...</span>
          </div>
        )}

        {!loading && todos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm">今日暂无任务</p>
            <p className="text-xs mt-1">录音中提到的今日任务会出现在这里</p>
          </div>
        )}

        {!loading && todos.length > 0 && (
          <div className="px-4 py-4">
            {/* Timeline */}
            <div className="relative">
              {/* Hour grid */}
              {HOURS.map((hour) => (
                <div key={hour} className="flex items-start border-t border-border/30" style={{ minHeight: "48px" }}>
                  <span className="text-[10px] text-muted-foreground w-10 pt-1 shrink-0 tabular-nums">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                  <div className="flex-1 pl-2" />
                </div>
              ))}

              {/* Now indicator */}
              {currentHour >= 6 && currentHour < 24 && (
                <div
                  className="absolute left-10 right-0 border-t-2 border-primary z-10 pointer-events-none"
                  style={{ top: `${nowOffset * 100}%` }}
                >
                  <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-primary" />
                </div>
              )}

              {/* Task blocks */}
              {todos.map((todo, index) => {
                const { top, height } = getTaskPosition(todo, index);
                return (
                  <div
                    key={todo.id}
                    className={cn(
                      "absolute left-12 right-2 rounded-lg px-3 py-2 border z-5 cursor-pointer",
                      todo.done
                        ? "bg-primary/5 border-primary/20 opacity-60"
                        : "bg-primary/10 border-primary/30 hover:bg-primary/15",
                    )}
                    style={{ top: `${top}%`, height: `${Math.max(height, 4)}%`, minHeight: "32px" }}
                    onClick={() => toggleTodo(todo.id)}
                  >
                    <div className="flex items-center gap-2">
                      {todo.done ? (
                        <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-primary" />
                        </div>
                      ) : (
                        <Circle className="w-4 h-4 text-primary/40 shrink-0" />
                      )}
                      <span className={cn(
                        "text-xs leading-tight truncate",
                        todo.done ? "text-muted-foreground line-through" : "text-foreground",
                      )}>
                        {todo.text}
                      </span>
                    </div>
                    {todo.estimated_minutes && (
                      <span className="text-[10px] text-muted-foreground mt-0.5 block pl-6">
                        {todo.estimated_minutes} 分钟
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    </SwipeBack>
  );
}

function getTaskPosition(todo: TodayTodo, index: number): { top: number; height: number } {
  const totalMinutes = 18 * 60; // 6am - midnight

  if (todo.scheduled_start && todo.scheduled_end) {
    const start = parseTimeMinutes(todo.scheduled_start);
    const end = parseTimeMinutes(todo.scheduled_end);
    return {
      top: ((start - 360) / totalMinutes) * 100,
      height: ((end - start) / totalMinutes) * 100,
    };
  }

  if (todo.estimated_minutes) {
    // Place unscheduled tasks sequentially starting from 9am
    const startOffset = 180 + index * (todo.estimated_minutes + 15); // 9am = 180min from 6am
    return {
      top: (startOffset / totalMinutes) * 100,
      height: (todo.estimated_minutes / totalMinutes) * 100,
    };
  }

  // Default: 30-minute blocks starting from 9am
  const startOffset = 180 + index * 45;
  return {
    top: (startOffset / totalMinutes) * 100,
    height: (30 / totalMinutes) * 100,
  };
}

function parseTimeMinutes(isoTime: string): number {
  try {
    const d = new Date(isoTime);
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return 540; // 9am fallback
  }
}
