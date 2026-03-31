"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getDeviceId } from "@/shared/lib/device";
import {
  listTodos,
  listProjects,
  createTodo as apiCreateTodo,
  updateTodo as apiUpdateTodo,
  deleteTodo as apiDeleteTodo,
} from "@/shared/lib/api/todos";
import type { TodoDTO, ProjectGroup, TimeSlotGroup } from "../lib/todo-types";
import { filterByDate, groupByTimeSlot, buildProjectGroups } from "../lib/todo-grouping";

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
    () => new Date().toISOString().split("T")[0],
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
  };
}
