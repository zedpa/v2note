"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";
import type { TodoItem } from "@/lib/types";

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const deviceId = await getDeviceId();

      const { data, error: err } = await supabase
        .from("todo")
        .select(`
          id,
          text,
          done,
          record_id,
          created_at,
          record:record_id (
            device_id,
            summary (title)
          )
        `)
        .order("created_at", { ascending: false });

      if (err) throw err;

      // Filter by device_id client-side (via record join)
      const items: TodoItem[] = (data ?? [])
        .filter((t: any) => {
          const record = Array.isArray(t.record) ? t.record[0] : t.record;
          return record?.device_id === deviceId;
        })
        .map((t: any) => {
          const record = Array.isArray(t.record) ? t.record[0] : t.record;
          const summary = record?.summary;
          const title = Array.isArray(summary) ? summary[0]?.title : summary?.title;
          return {
            id: t.id,
            text: t.text,
            done: t.done,
            source: title ?? null,
            record_id: t.record_id,
            created_at: t.created_at,
          };
        });

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

    const { error: err } = await supabase
      .from("todo")
      .update({ done: newDone })
      .eq("id", id);

    if (err) {
      // Revert on error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !newDone } : t)),
      );
    }
  }, [todos]);

  return { todos, loading, error, refetch: fetchTodos, toggleTodo };
}
