"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { TodoItem } from "@/shared/lib/types";
import { listTodos, updateTodo } from "@/shared/lib/api/todos";

export interface TodayTodo extends TodoItem {
  estimated_minutes?: number;
  scheduled_start?: string;
  scheduled_end?: string;
  priority?: number;
}

export function useTodayTodos() {
  const [todos, setTodos] = useState<TodayTodo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      await getDeviceId();
      const data = await listTodos();

      const today = new Date().toISOString().split("T")[0];

      // Filter for today's todos (created today or scheduled for today)
      const todayItems: TodayTodo[] = data
        .filter((t: any) => {
          const createdDate = t.created_at?.split("T")[0];
          const scheduledDate = t.scheduled_start?.split("T")[0];
          return (
            !t.done &&
            (createdDate === today || scheduledDate === today)
          );
        })
        .map((t: any) => ({
          id: t.id,
          text: t.text,
          done: t.done,
          source: null,
          record_id: t.record_id,
          created_at: t.created_at,
          estimated_minutes: t.estimated_minutes,
          scheduled_start: t.scheduled_start,
          scheduled_end: t.scheduled_end,
          priority: t.priority,
        }));

      setTodos(todayItems);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const toggleTodo = useCallback(async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    const newDone = !todo.done;
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: newDone } : t)),
    );

    try {
      await updateTodo(id, { done: newDone });
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !newDone } : t)),
      );
    }
  }, [todos]);

  return { todos, loading, refetch: fetchTodos, toggleTodo };
}
