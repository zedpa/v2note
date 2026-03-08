"use client";

import { X, Circle, Check, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayTodos, type TodayTodo } from "@/features/todos/hooks/use-today-todos";
import { SwipeBack } from "@/shared/components/swipe-back";
import { DOMAIN_CONFIG, getDomainStyle } from "@/features/todos/lib/domain-config";

interface TodayGanttProps {
  onClose: () => void;
}

// Show only even hours for cleaner grid
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

export function TodayGantt({ onClose }: TodayGanttProps) {
  const { todos, loading, toggleTodo } = useTodayTodos();

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const nowOffset = ((currentHour - 6) * 60 + currentMinutes) / (18 * 60);

  // Split scheduled vs unscheduled
  const scheduled = todos.filter((t) => t.scheduled_start);
  const unscheduled = todos.filter((t) => !t.scheduled_start);

  // Unique domains for legend
  const activeDomains = [...new Set(todos.map((t) => t.domain ?? "work"))];

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header */}
        <div className="relative px-4 py-4 border-b-2 border-border">
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: `linear-gradient(135deg, hsl(var(--domain-highlight-bg)), transparent 60%)` }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">今日任务</h1>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">
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

          {/* Domain legend pills */}
          {activeDomains.length > 0 && (
            <div className="relative flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
              {activeDomains.map((domain) => {
                const { config, fgStyle, bgStyle } = getDomainStyle(domain);
                const count = todos.filter((t) => (t.domain ?? "work") === domain).length;
                return (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
                    style={{ ...bgStyle, color: fgStyle.color }}
                  >
                    <config.icon className="w-3 h-3" />
                    {config.label} {count}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-4 py-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg animate-shimmer" />
              ))}
            </div>
          )}

          {!loading && todos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ backgroundColor: "hsl(var(--domain-highlight-bg))" }}
              >
                <Clock className="w-6 h-6" style={{ color: "hsl(var(--domain-highlight))" }} />
              </div>
              <p className="text-sm font-display font-semibold">今日暂无任务</p>
              <p className="text-xs mt-1">录音中提到的今日任务会出现在这里</p>
            </div>
          )}

          {!loading && todos.length > 0 && (
            <div className="px-4 py-4">
              {/* Timeline */}
              <div className="relative">
                {/* Hour grid */}
                {HOURS.map((hour, i) => {
                  const isEven = hour % 2 === 0;
                  return (
                    <div
                      key={hour}
                      className={cn(
                        "flex items-start border-t border-dashed border-border/40",
                        !isEven && "bg-secondary/15",
                      )}
                      style={{ minHeight: "48px" }}
                    >
                      <span className={cn(
                        "text-[10px] font-mono text-muted-foreground w-10 pt-1 shrink-0 tabular-nums",
                        !isEven && "opacity-0",
                      )}>
                        {String(hour).padStart(2, "0")}:00
                      </span>
                      <div className="flex-1 pl-2" />
                    </div>
                  );
                })}

                {/* Now indicator */}
                {currentHour >= 6 && currentHour < 24 && (
                  <div
                    className="absolute left-10 right-0 z-10 pointer-events-none flex items-center"
                    style={{ top: `${nowOffset * 100}%` }}
                  >
                    <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.4)]" />
                    <div className="w-full border-t-2 border-primary" />
                    <span className="absolute -right-0 -top-3 text-[9px] font-mono text-primary font-semibold bg-background/80 px-1 rounded">
                      {String(currentHour).padStart(2, "0")}:{String(currentMinutes).padStart(2, "0")}
                    </span>
                  </div>
                )}

                {/* Scheduled task blocks */}
                {scheduled.map((todo, index) => {
                  const { top, height } = getTaskPosition(todo, index);
                  const { fgStyle, bgStyle } = getDomainStyle(todo.domain);
                  return (
                    <div
                      key={todo.id}
                      className={cn(
                        "absolute left-12 right-2 rounded-lg overflow-hidden z-5 cursor-pointer transition-all",
                        todo.done && "opacity-50",
                      )}
                      style={{
                        top: `${top}%`,
                        height: `${Math.max(height, 4.5)}%`,
                        minHeight: "40px",
                        border: `2px solid ${fgStyle.color}`,
                        backgroundColor: bgStyle.backgroundColor,
                      }}
                      onClick={() => toggleTodo(todo.id)}
                    >
                      {/* Left domain bar */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ backgroundColor: fgStyle.color }}
                      />
                      <div className="flex items-center gap-2 px-3 py-1.5 pl-3.5">
                        {todo.done ? (
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${fgStyle.color}30` }}
                          >
                            <Check className="w-2.5 h-2.5" style={{ color: fgStyle.color }} />
                          </div>
                        ) : (
                          <Circle className="w-4 h-4 shrink-0" style={{ color: `${fgStyle.color}80` }} />
                        )}
                        <span className={cn(
                          "text-xs leading-tight truncate flex-1 font-medium",
                          todo.done ? "text-muted-foreground line-through" : "text-foreground",
                        )}>
                          {todo.text}
                        </span>
                        {todo.ai_actionable && !todo.done && (
                          <Sparkles className="w-3 h-3 shrink-0" style={{ color: "hsl(var(--domain-highlight))" }} />
                        )}
                      </div>
                      {todo.estimated_minutes && (
                        <span
                          className="absolute bottom-1 right-2 text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{ color: fgStyle.color, backgroundColor: `${fgStyle.color}15` }}
                        >
                          {todo.estimated_minutes}m
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Unscheduled section */}
              {unscheduled.length > 0 && (
                <div className="mt-4 pt-4 border-t-2 border-dashed border-border/40">
                  <h3 className="text-xs font-display font-semibold text-muted-foreground mb-2.5">
                    未安排时间 ({unscheduled.length})
                  </h3>
                  <div className="space-y-1.5">
                    {unscheduled.map((todo) => {
                      const { fgStyle, bgStyle, borderStyle } = getDomainStyle(todo.domain);
                      return (
                        <div
                          key={todo.id}
                          className={cn(
                            "relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer overflow-hidden transition-all",
                            todo.done && "opacity-50",
                          )}
                          style={{
                            ...borderStyle,
                            backgroundColor: bgStyle.backgroundColor,
                          }}
                          onClick={() => toggleTodo(todo.id)}
                        >
                          <div
                            className="absolute left-0 top-0 bottom-0 w-[3px]"
                            style={{ backgroundColor: fgStyle.color }}
                          />
                          {todo.done ? (
                            <div
                              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-1"
                              style={{ backgroundColor: `${fgStyle.color}30` }}
                            >
                              <Check className="w-2.5 h-2.5" style={{ color: fgStyle.color }} />
                            </div>
                          ) : (
                            <Circle className="w-4 h-4 shrink-0 ml-1" style={{ color: `${fgStyle.color}80` }} />
                          )}
                          <span className={cn(
                            "text-xs leading-tight truncate flex-1",
                            todo.done ? "text-muted-foreground line-through" : "text-foreground",
                          )}>
                            {todo.text}
                          </span>
                          {todo.estimated_minutes && (
                            <span
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ color: fgStyle.color, backgroundColor: `${fgStyle.color}15` }}
                            >
                              {todo.estimated_minutes}m
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SwipeBack>
  );
}

function getTaskPosition(todo: TodayTodo, index: number): { top: number; height: number } {
  const totalMinutes = 18 * 60;

  if (todo.scheduled_start && todo.scheduled_end) {
    const start = parseTimeMinutes(todo.scheduled_start);
    const end = parseTimeMinutes(todo.scheduled_end);
    return {
      top: ((start - 360) / totalMinutes) * 100,
      height: ((end - start) / totalMinutes) * 100,
    };
  }

  if (todo.estimated_minutes) {
    const startOffset = 180 + index * (todo.estimated_minutes + 15);
    return {
      top: (startOffset / totalMinutes) * 100,
      height: (todo.estimated_minutes / totalMinutes) * 100,
    };
  }

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
    return 540;
  }
}
