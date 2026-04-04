"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getDeviceId } from "@/shared/lib/device";
import { on } from "@/features/recording/lib/events";
import {
  listTodos,
  listProjects,
  createTodo as apiCreateTodo,
  updateTodo as apiUpdateTodo,
  deleteTodo as apiDeleteTodo,
} from "@/shared/lib/api/todos";
import type { TodoDTO, ProjectGroup, TimeSlotGroup } from "../lib/todo-types";
import { filterByDate, groupByTimeSlot, buildProjectGroups } from "../lib/todo-grouping";
import { getLocalToday } from "../lib/date-utils";

/**
 * 统一待办数据源，替代 useTodos + useTodayTodos
 * 所有视图从这个 store 读数据、写操作
 */
export function useTodoStore() {
  const [allTodos, setAllTodos] = useState<TodoDTO[]>([]);
  const [projects, setProjects] = useState<TodoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    () => getLocalToday(),
  );

  // ===== 数据获取 =====

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await getDeviceId();

      const [todosData, projectsData] = await Promise.all([
        listTodos(),
        listProjects().catch(() => [] as TodoDTO[]),
      ]);

      setAllTodos(todosData);
      setProjects(projectsData);
    } catch (e: any) {
      setError(e.message ?? "加载待办失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // digest 处理完成后自动刷新待办（冷启动/新输入都会触发）
    const unsub = on("recording:processed", () => refresh());
    return unsub;
  }, [refresh]);

  // ===== 派生数据 =====

  const dateTodos = useMemo(
    () => filterByDate(allTodos, selectedDate),
    [allTodos, selectedDate],
  );

  const timeSlotGroups: TimeSlotGroup[] = useMemo(
    () => groupByTimeSlot(dateTodos),
    [dateTodos],
  );

  const projectGroups: ProjectGroup[] = useMemo(
    () => buildProjectGroups(allTodos, projects),
    [allTodos, projects],
  );

  // ===== 操作 =====

  const toggle = useCallback(
    async (id: string) => {
      const todo = allTodos.find((t) => t.id === id);
      if (!todo) return;

      const newDone = !todo.done;

      // 乐观更新
      setAllTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: newDone } : t)),
      );

      try {
        await apiUpdateTodo(id, { done: newDone });
      } catch {
        // 回滚
        setAllTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, done: !newDone } : t)),
        );
      }
    },
    [allTodos],
  );

  const create = useCallback(
    async (params: {
      text: string;
      scheduled_start?: string;
      estimated_minutes?: number;
      priority?: number;
      domain?: string;
      parent_id?: string;
      level?: number;
    }) => {
      const result = await apiCreateTodo(params);
      // 刷新以获取完整数据
      await refresh();
      return result;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, params: Parameters<typeof apiUpdateTodo>[1]) => {
      await apiUpdateTodo(id, params);
      await refresh();
    },
    [refresh],
  );

  /** 推迟到明天（保持同一时间，日期+1） */
  const postpone = useCallback(
    async (id: string) => {
      const todo = allTodos.find((t) => t.id === id);
      if (!todo) return;

      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let newStart: string;
      if (todo.scheduled_start) {
        // 保留原时间，日期推到明天
        const orig = new Date(todo.scheduled_start.replace(/Z$/i, ""));
        tomorrow.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
        newStart = tomorrow.toISOString();
      } else {
        // 无时间则设为明天 09:00
        tomorrow.setHours(9, 0, 0, 0);
        newStart = tomorrow.toISOString();
      }

      // 乐观更新
      setAllTodos((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, scheduled_start: newStart } : t,
        ),
      );

      try {
        await apiUpdateTodo(id, { scheduled_start: newStart });
      } catch {
        await refresh();
      }
    },
    [allTodos, refresh],
  );

  /** 撤销完成（恢复为未完成） */
  const undoToggle = useCallback(
    async (id: string) => {
      setAllTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: false } : t)),
      );
      try {
        await apiUpdateTodo(id, { done: false });
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  /** 撤销删除（重新创建 — 简化实现：刷新列表） */
  const undoRemove = useCallback(
    async () => {
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      // 乐观删除
      setAllTodos((prev) => prev.filter((t) => t.id !== id));
      try {
        await apiDeleteTodo(id);
      } catch {
        await refresh(); // 回滚
      }
    },
    [refresh],
  );

  return {
    // 数据
    allTodos,
    projects,
    loading,
    error,

    // 派生
    dateTodos,
    timeSlotGroups,
    projectGroups,

    // 日期
    selectedDate,
    setSelectedDate,

    // 操作
    refresh,
    toggle,
    create,
    update,
    remove,
    postpone,
    undoToggle,
    undoRemove,
  };
}
