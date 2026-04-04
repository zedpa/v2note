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
  const priority = todo.priority ?? 3;

  // 格式化日期显示
  const dateLabel = todo.scheduled_start
    ? formatRelativeDate(todo.scheduled_start)
    : null;

  const durationLabel = todo.estimated_minutes
    ? `${todo.estimated_minutes}分`
    : null;

  // 优先级左边框颜色
  const priorityBorder =
    priority >= 5
      ? "border-l-[3px] border-l-red-500"
      : priority >= 4
        ? "border-l-[3px] border-l-orange-400"
        : "";

  return (
    <div
      data-testid="task-item"
      className={`flex items-start gap-3 rounded-xl border border-border bg-card p-4 ${priorityBorder}`}
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
        className="min-w-0 flex-1 cursor-pointer select-none"
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
        {(dateLabel || durationLabel || todo.goal_title || todo.subtask_count > 0) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {dateLabel && (
              <span className="text-primary">{dateLabel}</span>
            )}
            {durationLabel && <span>{durationLabel}</span>}
            {todo.subtask_count > 0 && (
              <span className="text-muted-foreground">
                {todo.subtask_done_count}/{todo.subtask_count} 子任务
              </span>
            )}
            {todo.goal_title && (
              <span className="truncate max-w-[120px] rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                {todo.goal_title}
              </span>
            )}
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
