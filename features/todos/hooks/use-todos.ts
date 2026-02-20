"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { TodoItem } from "@/shared/lib/types";
import { listTodos, updateTodo } from "@/shared/lib/api/todos";

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      await getDeviceId(); // ensure API deviceId is set

      const data = await listTodos();

      const items: TodoItem[] = data.map((t: any) => ({
        id: t.id,
        text: t.text,
        done: t.done,
        source: null,
        record_id: t.record_id,
        created_at: t.created_at,
      }));

      setTodos(items);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load todos");
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

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: newDone } : t)),
    );

    try {
      await updateTodo(id, { done: newDone });
    } catch {
      // Revert on error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !newDone } : t)),
      );
    }
  }, [todos]);

  return { todos, loading, error, refetch: fetchTodos, toggleTodo };
}
