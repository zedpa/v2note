"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import type { ProjectGroup, TodoDTO } from "../lib/todo-types";
import type { ProjectColor } from "../lib/project-colors";
import { SwipeableTaskItem } from "./swipeable-task-item";
import { AddTaskRow } from "./add-task-row";

const MAX_VISIBLE_PENDING = 5;

interface ProjectCardProps {
  group: ProjectGroup;
  color: ProjectColor;
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onAdd: (parentId?: string) => void;
  onPostpone: (id: string) => void;
  onRemove: (id: string) => void;
  swipeOpenId: string | null;
  onSwipeOpenChange: (id: string | null) => void;
  onHeaderPress?: () => void;
}

export function ProjectCard({
  group,
  color,
  onToggle,
  onPress,
  onAdd,
  onPostpone,
  onRemove,
  swipeOpenId,
  onSwipeOpenChange,
  onHeaderPress,
}: ProjectCardProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const title = group.isInbox ? "收集箱" : group.project?.text ?? "未命名";
  const totalCount = group.tasks.length;
  const doneCount = group.doneCount;

  const pending = group.tasks.filter((t) => !t.done);
  const completed = group.tasks.filter((t) => t.done);

  // 截断未完成列表
  const visiblePending = pending.slice(0, MAX_VISIBLE_PENDING);
  const hiddenPendingCount = pending.length - visiblePending.length;

  return (
    <div
      data-testid={group.isInbox ? "inbox-card" : "project-card"}
      className={`flex flex-col rounded-2xl border ${color.border} bg-card overflow-hidden`}
    >
      {/* 带颜色的头部 */}
      <button
        onClick={onHeaderPress}
        className={`flex items-center justify-between px-4 py-3 ${color.bg}`}
      >
        <span className={`text-sm font-semibold ${color.text}`}>
          {title}
        </span>
        <span className={`text-xs ${color.text} opacity-70`}>
          {doneCount}/{totalCount}
        </span>
      </button>

      {/* 待办列表 */}
      <div className="space-y-2 px-3 py-3">
        {visiblePending.map((todo) => (
          <MiniTaskRow
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onPress={onPress}
          />
        ))}

        {hiddenPendingCount > 0 && (
          <div className="px-2 text-xs text-muted-foreground">
            还有 {hiddenPendingCount} 条
          </div>
        )}

        {/* 已完成折叠区 */}
        {completed.length > 0 && (
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1 px-2 text-xs text-muted-foreground"
          >
            {showCompleted ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {completed.length} 条已完成
          </button>
        )}

        {showCompleted &&
          completed.map((todo) => (
            <MiniTaskRow
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onPress={onPress}
            />
          ))}
      </div>

      {/* 添加待办 */}
      <div className="px-3 pb-3">
        <AddTaskRow onAdd={() => onAdd(group.project?.id)} />
      </div>
    </div>
  );
}

/** 瀑布流卡片内的简洁待办行（不可滑动，只有 checkbox + text + 星标） */
function MiniTaskRow({
  todo,
  onToggle,
  onPress,
}: {
  todo: TodoDTO;
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
}) {
  const hasStar = (todo.priority ?? 0) >= 4;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 cursor-pointer select-none"
      onClick={() => onPress(todo)}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(todo.id);
        }}
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
          todo.done
            ? "border-muted-foreground bg-muted-foreground/20"
            : "border-muted-foreground bg-transparent"
        }`}
      >
        {todo.done && (
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        )}
      </button>

      {/* Text */}
      <span
        className={`flex-1 truncate text-xs leading-snug ${
          todo.done
            ? "text-muted-foreground line-through opacity-50"
            : "text-foreground"
        }`}
      >
        {todo.text}
      </span>

      {/* 优先级星标 */}
      {hasStar && !todo.done && (
        <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />
      )}
    </div>
  );
}
