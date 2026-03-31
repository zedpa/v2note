"use client";

import { MoreVertical } from "lucide-react";
import type { ProjectGroup, TodoDTO } from "../lib/todo-types";
import { TaskItem } from "./task-item";
import { AddTaskRow } from "./add-task-row";

interface ProjectCardProps {
  group: ProjectGroup;
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onAdd: (parentId?: string) => void;
}

export function ProjectCard({ group, onToggle, onPress, onAdd }: ProjectCardProps) {
  const title = group.isInbox ? "其他" : group.project?.text ?? "未命名";
  const count = group.pendingCount;

  // 未完成在前，已完成在后
  const pending = group.tasks.filter((t) => !t.done);
  const completed = group.tasks.filter((t) => t.done);

  return (
    <div
      data-testid={group.isInbox ? "inbox-card" : "project-card"}
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-4 pt-2.5">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          {title}
          <span className="text-sm text-muted-foreground">{count}</span>
        </div>
        {!group.isInbox && (
          <button className="text-muted-foreground">
            <MoreVertical className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Task list — scrollable */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
        {pending.map((todo) => (
          <TaskItem
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onPress={onPress}
          />
        ))}
        {completed.map((todo) => (
          <TaskItem
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onPress={onPress}
          />
        ))}
      </div>

      {/* Add task */}
      <div className="px-5 pb-4">
        <AddTaskRow onAdd={() => onAdd(group.project?.id)} />
      </div>
    </div>
  );
}
