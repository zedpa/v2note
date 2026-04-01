"use client";

import { Check } from "lucide-react";
import type { TodoDTO } from "../lib/todo-types";
import { toLocalDate, getLocalToday } from "../lib/date-utils";

interface TaskItemProps {
  todo: TodoDTO;
  onToggle: (id: string) => void;
  onPress?: (todo: TodoDTO) => void;
}

export function TaskItem({ todo, onToggle, onPress }: TaskItemProps) {
  const isDone = todo.done;

  // 格式化日期显示
  const dateLabel = todo.scheduled_start
    ? formatRelativeDate(todo.scheduled_start)
    : null;

  const durationLabel = todo.estimated_minutes
    ? `${todo.estimated_minutes}分`
    : null;

  return (
    <div
      data-testid="task-item"
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
    >
      {/* Checkbox */}
      <button
        data-testid="task-checkbox"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(todo.id);
        }}
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
          isDone
            ? "border-muted-foreground bg-muted-foreground/20"
            : "border-muted-foreground bg-transparent"
        }`}
      >
        {isDone && <Check className="h-3 w-3 text-muted-foreground" />}
      </button>

      {/* Content */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => onPress?.(todo)}
      >
        <div
          className={`text-sm leading-snug ${
            isDone
              ? "text-muted-foreground line-through opacity-50"
              : "text-foreground"
          }`}
        >
          {todo.text}
        </div>

        {/* Meta 行 */}
        {(dateLabel || durationLabel) && (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            {dateLabel && (
              <span className="text-primary">{dateLabel}</span>
            )}
            {durationLabel && <span>{durationLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateStr = toLocalDate(isoString);
  const todayStr = getLocalToday();
  const tomorrowStr = toLocalDate(tomorrow.toISOString());

  if (dateStr === todayStr) return "今天";
  if (dateStr === tomorrowStr) return "明天";

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${month}月${day}日 ${weekdays[date.getDay()]}`;
}
