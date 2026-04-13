"use client";

import { useState, useCallback, useEffect } from "react";
// ViewMode type is exported for use by workspace-header
import { useTodoStore } from "../hooks/use-todo-store";
import { useViewedDates } from "../hooks/use-viewed-dates";
import type { TodoDTO } from "../lib/todo-types";
import { TimeView } from "./time-view";
import { ProjectView } from "./project-view";
import { TodoEditSheet } from "./todo-edit-sheet";
import { showUndoToast } from "../hooks/use-undo-toast";

export type ViewMode = "time" | "project";

interface TodoWorkspaceProps {
  onOpenChat?: (message: string) => void;
  viewMode?: ViewMode;
  /** 注册刷新函数，供父组件调用（下拉刷新） */
  onRegisterRefresh?: (fn: () => Promise<boolean>) => void;
}

export function TodoWorkspace({ onOpenChat, viewMode = "time", onRegisterRefresh }: TodoWorkspaceProps) {
  const store = useTodoStore();

  // 注册刷新函数供父组件调用（下拉刷新）
  useEffect(() => {
    onRegisterRefresh?.(() => store.refresh());
  }, [onRegisterRefresh, store.refresh]);
  const { viewedDates, markViewed } = useViewedDates();
  const [editTodo, setEditTodo] = useState<TodoDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);

  /** 右滑完成 + 撤销 Toast */
  const handleSwipeToggle = useCallback(
    (id: string) => {
      store.toggle(id);
      const todo = store.allTodos.find((t) => t.id === id);
      showUndoToast({
        message: `已完成「${todo?.text?.slice(0, 15) ?? "待办"}」`,
        onUndo: () => store.undoToggle(id),
      });
    },
    [store],
  );

  /** 左滑推迟 */
  const handlePostpone = useCallback(
    (id: string) => {
      store.postpone(id);
      const todo = store.allTodos.find((t) => t.id === id);
      showUndoToast({
        message: `已推迟「${todo?.text?.slice(0, 15) ?? "待办"}」到明天`,
        onUndo: () => { store.refresh(); },
      });
    },
    [store],
  );

  /** 左滑删除 + 撤销 Toast */
  const handleRemove = useCallback(
    (id: string) => {
      const todo = store.allTodos.find((t) => t.id === id);
      store.remove(id);
      showUndoToast({
        message: `已删除「${todo?.text?.slice(0, 15) ?? "待办"}」`,
        onUndo: () => store.undoRemove(),
      });
    },
    [store],
  );

  const handlePress = useCallback((todo: TodoDTO) => {
    setEditTodo(todo);
    setEditOpen(true);
  }, []);

  const handleEditClose = useCallback(() => {
    setEditOpen(false);
    setEditTodo(null);
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
      {viewMode === "time" ? (
        <TimeView
          selectedDate={store.selectedDate}
          onDateChange={store.setSelectedDate}
          timeSlotGroups={store.timeSlotGroups}
          onToggle={handleSwipeToggle}
          onPress={handlePress}
          onCreate={store.create}
          onPostpone={handlePostpone}
          onRemove={handleRemove}
          swipeOpenId={swipeOpenId}
          onSwipeOpenChange={setSwipeOpenId}
          projects={store.projects}
          allTodos={store.allTodos}
          viewedDates={viewedDates}
          onMarkViewed={markViewed}
        />
      ) : (
        <ProjectView
          projectGroups={store.projectGroups}
          onToggle={handleSwipeToggle}
          onPress={handlePress}
          onCreate={store.create}
          onPostpone={handlePostpone}
          onRemove={handleRemove}
          swipeOpenId={swipeOpenId}
          onSwipeOpenChange={setSwipeOpenId}
          projects={store.projects}
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
