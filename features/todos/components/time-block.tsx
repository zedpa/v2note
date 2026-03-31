"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { TimeSlotConfig } from "../lib/time-slots";
import type { TimeSlotGroup } from "../lib/todo-types";
import type { TodoDTO } from "../lib/todo-types";
import { TaskItem } from "./task-item";
import { TaskCardEmpty } from "./task-card-empty";

interface TimeBlockProps {
  config: TimeSlotConfig;
  group: TimeSlotGroup;
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onAdd: () => void;
}

export function TimeBlock({ config, group, onToggle, onPress, onAdd }: TimeBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const Icon = config.icon;
  const pendingCount = group.pending.length;
  const totalCount = pendingCount + group.completed.length;
  const isEmpty = totalCount === 0;

  return (
    <div
      data-testid={`time-block-${config.key}`}
      className="mb-6 flex flex-col gap-3 px-5"
    >
      {/* Block Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-fit items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[11px] font-semibold tracking-wider"
        style={{
          background: `var(${config.colorVar})`,
          color: `var(${config.textColorVar})`,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
        {config.label} ({pendingCount})
        <ChevronDown
          className={`h-3 w-3 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      </button>

      {/* Content */}
      {!collapsed && (
        <>
          {isEmpty ? (
            <TaskCardEmpty hint={config.emptyHint} onAdd={onAdd} />
          ) : (
            <div className="flex flex-col gap-3">
              {/* 未完成 */}
              {group.pending.map((todo) => (
                <TaskItem
                  key={todo.id}
                  todo={todo}
                  onToggle={onToggle}
                  onPress={onPress}
                />
              ))}

              {/* 已完成（划线） */}
              {group.completed.length > 0 && (
                <div className="flex flex-col gap-3">
                  {group.completed.map((todo) => (
                    <TaskItem
                      key={todo.id}
                      todo={todo}
                      onToggle={onToggle}
                      onPress={onPress}
                    />
                  ))}
                </div>
              )}

              {/* 添加按钮 */}
              <button
                onClick={onAdd}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors active:bg-card/60"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
