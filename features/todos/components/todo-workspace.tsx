"use client";

import { useState, useCallback } from "react";
import { useTodoStore } from "../hooks/use-todo-store";
import type { TodoDTO } from "../lib/todo-types";
import { TimeView } from "./time-view";
import { ProjectView } from "./project-view";
import { TodoEditSheet } from "./todo-edit-sheet";

type ViewMode = "time" | "project";

interface TodoWorkspaceProps {
  onOpenChat?: (message: string) => void;
}

export function TodoWorkspace({ onOpenChat }: TodoWorkspaceProps) {
  const store = useTodoStore();
  const [viewMode, setViewMode] = useState<ViewMode>("time");
  const [editTodo, setEditTodo] = useState<TodoDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const handlePress = useCallback((todo: TodoDTO) => {
    setEditTodo(todo);
    setEditOpen(true);
  }, []);

  const handleEditClose = useCallback(() => {
    setEditOpen(false);
    setEditTodo(null);
  }, []);

  const handleToggleView = useCallback(() => {
    setViewMode((v) => (v === "time" ? "project" : "time"));
  }, []);

  if (store.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="px-5 py-20 text-center">
        <div className="mb-2 text-sm text-muted-foreground">{store.error}</div>
        <button
          onClick={store.refresh}
          className="text-sm text-primary"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div data-testid="todo-workspace">
      {/* 视图切换按钮 — 固定在右上角 */}
      <div className="flex justify-end px-5 pb-2">
        <button
          data-testid="view-toggle"
          onClick={handleToggleView}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors active:bg-card active:text-foreground"
          aria-label={viewMode === "time" ? "切换到项目视图" : "切换到时间视图"}
        >
          {viewMode === "time" ? (
            // 项目图标
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="9" y1="14" x2="15" y2="14" />
              <line x1="9" y1="18" x2="13" y2="18" />
            </svg>
          ) : (
            // 时间图标
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )}
        </button>
      </div>

      {/* 视图内容 */}
      {viewMode === "time" ? (
        <TimeView
          selectedDate={store.selectedDate}
          onDateChange={store.setSelectedDate}
          timeSlotGroups={store.timeSlotGroups}
          onToggle={store.toggle}
          onPress={handlePress}
          onCreate={store.create}
        />
      ) : (
        <ProjectView
          projectGroups={store.projectGroups}
          onToggle={store.toggle}
          onPress={handlePress}
          onCreate={store.create}
        />
      )}

      {/* 编辑 Sheet */}
      <TodoEditSheet
        todo={editTodo}
        open={editOpen}
        onClose={handleEditClose}
        onUpdated={store.refresh}
        onAskAI={onOpenChat}
      />
    </div>
  );
}
