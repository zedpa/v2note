"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getDeviceId } from "@/shared/lib/device";
import { on } from "@/features/recording/lib/events";
import {
  listTodos,
  listProjects,
  createTodo as apiCreateTodo,
  updateTodo as apiUpdateTodo,
  deleteTodo as apiDeleteTodo,
} from "@/shared/lib/api/todos";
import {
  cancelTodoReminder,
  syncTodoReminders,
} from "@/shared/lib/notifications";
import type { TodoDTO, ProjectGroup, TimeSlotGroup } from "../lib/todo-types";
import { filterByDate, groupByTimeSlot, buildProjectGroups } from "../lib/todo-grouping";
import { getLocalToday, parseScheduledTime, toLocalDateStr } from "../lib/date-utils";
import { localTzOffset } from "../lib/time-slots";

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

  const refresh = useCallback(async (): Promise<boolean> => {
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

      // 首次加载 或 App resume 后同步所有待办提醒通知
      syncTodoReminders(todosData).catch(() => {});

      return true;
    } catch (e: any) {
      setError(e.message ?? "加载待办失败");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeListenerRef = useRef<(() => void) | null>(null);
  const cleanedUpRef = useRef(false);

  useEffect(() => {
    cleanedUpRef.current = false;
    refresh();
    // digest 处理完成后自动刷新待办（冷启动/新输入都会触发）
    const unsub = on("recording:processed", () => refresh());

    // 监听 App 从后台恢复，触发 refresh + sync
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("resume", () => {
          refresh();
        });
        // 如果在 await 期间组件已卸载，立即清理
        if (cleanedUpRef.current) {
          listener.remove();
        } else {
          resumeListenerRef.current = () => listener.remove();
        }
      } catch {
        // Web 环境，静默跳过
      }
    })();

    return () => {
      cleanedUpRef.current = true;
      unsub();
      resumeListenerRef.current?.();
      resumeListenerRef.current = null;
    };
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
        // 完成时取消提醒通知
        if (newDone) {
          cancelTodoReminder(id).catch(() => {});
        }
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
      // 刷新以获取完整数据（含后端计算的 reminder_at）
      await refresh();
      // refresh 中已调用 syncTodoReminders，新 todo 的通知会被自动调度
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
      const pad = (n: number) => String(n).padStart(2, "0");
      const tz = localTzOffset();
      if (todo.scheduled_start) {
        // 保留原时间，日期推到明天
        const orig = parseScheduledTime(todo.scheduled_start);
        const tomorrowDate = toLocalDateStr(tomorrow);
        newStart = `${tomorrowDate}T${pad(orig.getHours())}:${pad(orig.getMinutes())}:00${tz}`;
      } else {
        // 无时间则设为明天 09:00
        const tomorrowDate = toLocalDateStr(tomorrow);
        newStart = `${tomorrowDate}T09:00:00${tz}`;
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

  /** 撤销完成（恢复为未完成，重新调度提醒通知） */
  const undoToggle = useCallback(
    async (id: string) => {
      setAllTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: false } : t)),
      );
      try {
        await apiUpdateTodo(id, { done: false });
        // refresh 内的 syncTodoReminders 会重新调度被取消的通知
        await refresh();
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
      // 取消该待办的提醒通知
      cancelTodoReminder(id).catch(() => {});
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
