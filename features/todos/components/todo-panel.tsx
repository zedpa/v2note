"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Check, Circle, Sparkles, Clock, Target,
  ChevronRight, Briefcase, Home, Users, BookOpen, Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodos } from "@/features/todos/hooks/use-todos";
import { useTodayTodos, type TodayTodo } from "@/features/todos/hooks/use-today-todos";
import { ImpactDots } from "@/features/todos/components/impact-dots";
import { getDomainStyle } from "@/features/todos/lib/domain-config";
import { listMemories } from "@/shared/lib/api/memory";
import type { MemoryEntry, TodoItem } from "@/shared/lib/types";

interface TodoPanelProps {
  open: boolean;
  onClose: () => void;
  onNoteClick?: (noteId: string) => void;
}

type Tab = "today" | "all" | "goals";

export function TodoPanel({ open, onClose, onNoteClick }: TodoPanelProps) {
  const [tab, setTab] = useState<Tab>("today");
  const [goals, setGoals] = useState<MemoryEntry[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);

  // Load goals (memories prefixed with [目标])
  useEffect(() => {
    if (!open) return;
    setGoalsLoading(true);
    listMemories({ limit: 50 })
      .then((memories) => {
        setGoals(memories.filter((m) => m.content.startsWith("[目标]")));
      })
      .catch(() => {})
      .finally(() => setGoalsLoading(false));
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Panel — slides from right, 3/4 width */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-[75vw] max-w-md bg-background shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-safe pb-3 pt-4 border-b border-border">
          <h2 className="font-display text-lg font-bold text-foreground">待办看板</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {([
            { key: "today" as Tab, label: "今日", icon: Clock },
            { key: "all" as Tab, label: "全部", icon: Briefcase },
            { key: "goals" as Tab, label: "目标", icon: Target },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative",
                tab === key
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {tab === key && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "today" && <TodayTab onNoteClick={onNoteClick} />}
          {tab === "all" && <AllTodosTab onNoteClick={onNoteClick} />}
          {tab === "goals" && <GoalsTab goals={goals} loading={goalsLoading} />}
        </div>
      </div>
    </>
  );
}

/* ── Today Tab: timeline + scheduled tasks ── */

function TodayTab({ onNoteClick }: { onNoteClick?: (id: string) => void }) {
  const { todos, loading, toggleTodo } = useTodayTodos();

  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  const scheduled = todos.filter((t) => t.scheduled_start);
  const unscheduled = todos.filter((t) => !t.scheduled_start);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg animate-shimmer" />
        ))}
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Clock className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">今日暂无任务</p>
        <p className="text-xs mt-1 opacity-60">录音中提到的任务会自动出现</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Mini timeline */}
      <div className="relative">
        {[8, 10, 12, 14, 16, 18, 20].map((hour) => (
          <div key={hour} className="flex items-start border-t border-dashed border-border/30" style={{ minHeight: "44px" }}>
            <span className="text-[9px] font-mono text-muted-foreground/60 w-8 pt-1 shrink-0">
              {String(hour).padStart(2, "0")}
            </span>
            <div className="flex-1" />
          </div>
        ))}

        {/* Now line */}
        {currentHour >= 8 && currentHour < 22 && (
          <div
            className="absolute left-8 right-0 z-10 pointer-events-none"
            style={{ top: `${((currentHour - 8 + currentMin / 60) / 14) * 100}%` }}
          >
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
              <div className="flex-1 border-t border-primary" />
            </div>
          </div>
        )}

        {/* Scheduled blocks */}
        {scheduled.map((todo) => {
          const { top, height } = getTimePosition(todo);
          const { fgStyle, bgStyle } = getDomainStyle(todo.domain);
          return (
            <div
              key={todo.id}
              className={cn(
                "absolute left-9 right-1 rounded-md overflow-hidden z-5 transition-all",
                todo.done && "opacity-40",
              )}
              style={{
                top: `${top}%`,
                height: `${Math.max(height, 5)}%`,
                minHeight: "32px",
                border: `1.5px solid ${fgStyle.color}40`,
                backgroundColor: bgStyle.backgroundColor,
              }}
              onClick={() => toggleTodo(todo.id)}
            >
              <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: fgStyle.color }} />
              <div className="flex items-center gap-1.5 px-2 py-1 pl-2.5">
                <TodoCheckbox done={todo.done} color={fgStyle.color} small />
                <span className={cn(
                  "text-[11px] leading-tight truncate flex-1",
                  todo.done ? "line-through text-muted-foreground" : "text-foreground",
                )}>
                  {todo.text}
                </span>
                {todo.ai_actionable && !todo.done && (
                  <Sparkles className="w-3 h-3 shrink-0 text-amber-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled */}
      {unscheduled.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-border/40">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2">未排期 ({unscheduled.length})</p>
          <div className="space-y-1.5">
            {unscheduled.map((todo) => (
              <CompactTodoRow
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onNoteClick={onNoteClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── All Todos Tab: grouped by domain ── */

function AllTodosTab({ onNoteClick }: { onNoteClick?: (id: string) => void }) {
  const { todos, loading, toggleTodo } = useTodos();

  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const grouped = groupByDomain(pending);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg animate-shimmer" />
        ))}
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Briefcase className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">暂无待办</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Stats bar */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-mono" style={{ color: "hsl(var(--primary))" }}>
          {pending.length} 待办
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          {done.length} 完成
        </span>
        {pending.length + done.length > 0 && (
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{ width: `${(done.length / (pending.length + done.length)) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Domain groups */}
      {Object.entries(grouped).map(([domain, items]) => {
        const { config, fgStyle } = getDomainStyle(domain);
        return (
          <div key={domain} className="mb-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: fgStyle.color }} />
              <span className="text-xs font-semibold text-foreground">{config.label}</span>
              <span className="text-[9px] text-muted-foreground font-mono">{items.length}</span>
              <div className="flex-1 h-px" style={{ backgroundColor: `${fgStyle.color}20` }} />
            </div>
            <div className="space-y-1">
              {items.map((todo) => (
                <CompactTodoRow
                  key={todo.id}
                  todo={todo}
                  onToggle={() => toggleTodo(todo.id)}
                  onNoteClick={onNoteClick}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Done */}
      {done.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2">已完成 ({done.length})</p>
          <div className="space-y-1">
            {done.slice(0, 8).map((todo) => (
              <div
                key={todo.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                onClick={() => toggleTodo(todo.id)}
              >
                <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-primary" />
                </div>
                <span className="text-[11px] text-muted-foreground line-through truncate">{todo.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Goals Tab ── */

function GoalsTab({ goals, loading }: { goals: MemoryEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg animate-shimmer" />
        ))}
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Target className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">暂无目标</p>
        <p className="text-xs mt-1 opacity-60">对 AI 说出你的目标，会自动记录</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {goals.map((goal) => {
        const text = goal.content.replace(/^\[目标\]\s*/, "");
        const importance = goal.importance;
        return (
          <div
            key={goal.id}
            className="relative p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-500 rounded-l-lg" />
            <div className="flex items-start gap-2 pl-1">
              <Target className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-snug">{text}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {goal.source_date ?? ""}
                  </span>
                  {importance >= 8 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                      重要 {importance}/10
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Shared components ── */

function TodoCheckbox({ done, color, small }: { done: boolean; color: string; small?: boolean }) {
  const size = small ? "w-3.5 h-3.5" : "w-4 h-4";
  if (done) {
    return (
      <div className={cn(size, "rounded-full flex items-center justify-center shrink-0")} style={{ backgroundColor: `${color}30` }}>
        <Check className={small ? "w-2 h-2" : "w-2.5 h-2.5"} style={{ color }} />
      </div>
    );
  }
  return <Circle className={cn(size, "shrink-0")} style={{ color: `${color}60` }} />;
}

function CompactTodoRow({
  todo,
  onToggle,
  onNoteClick,
}: {
  todo: TodoItem;
  onToggle: () => void;
  onNoteClick?: (id: string) => void;
}) {
  const { fgStyle, bgStyle } = getDomainStyle(todo.domain);
  return (
    <div
      className="relative flex items-center gap-2 px-2.5 py-2 rounded-md border overflow-hidden transition-colors hover:bg-secondary/30"
      style={{ borderColor: `${fgStyle.color}20` }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: fgStyle.color }} />
      <button type="button" onClick={onToggle} className="shrink-0">
        <TodoCheckbox done={todo.done} color={fgStyle.color} small />
      </button>
      <button
        type="button"
        onClick={() => onNoteClick?.(todo.record_id)}
        className="flex-1 min-w-0 text-left"
      >
        <p className={cn(
          "text-[11px] leading-tight truncate",
          todo.done ? "line-through text-muted-foreground" : "text-foreground",
        )}>
          {todo.text}
        </p>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        {todo.ai_actionable && (
          <Sparkles className="w-3 h-3 text-amber-500" />
        )}
        {(todo.impact ?? 0) >= 5 && (
          <ImpactDots impact={todo.impact ?? 5} domain={todo.domain} />
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function getTimePosition(todo: TodayTodo): { top: number; height: number } {
  const totalMinutes = 14 * 60; // 8:00 - 22:00
  if (todo.scheduled_start && todo.scheduled_end) {
    const start = parseMinutes(todo.scheduled_start) - 480;
    const end = parseMinutes(todo.scheduled_end) - 480;
    return {
      top: (start / totalMinutes) * 100,
      height: ((end - start) / totalMinutes) * 100,
    };
  }
  return { top: 10, height: 5 };
}

function parseMinutes(iso: string): number {
  try {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return 540;
  }
}

function groupByDomain(items: TodoItem[]): Record<string, TodoItem[]> {
  const groups: Record<string, TodoItem[]> = {};
  const sorted = [...items].sort((a, b) => ((b.impact ?? 5) * 2) - ((a.impact ?? 5) * 2));
  for (const item of sorted) {
    const domain = item.domain ?? "work";
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(item);
  }
  return groups;
}
