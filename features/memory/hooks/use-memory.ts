"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/shared/lib/device";
import type { MemoryEntry } from "@/shared/lib/types";
import {
  listMemories,
  deleteMemory as apiDeleteMemory,
  updateMemory as apiUpdateMemory,
} from "@/shared/lib/api/memory";
import { toast } from "sonner";

export function useMemory() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 50;

  const fetchMemories = useCallback(async (limit?: number) => {
    try {
      await getDeviceId();
      const data = await listMemories({ limit: limit ?? PAGE_SIZE });
      setMemories(data ?? []);
      setHasMore((data?.length ?? 0) >= PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const loadMore = useCallback(async () => {
    const nextLimit = memories.length + PAGE_SIZE;
    await fetchMemories(nextLimit);
  }, [memories.length, fetchMemories]);

  const deleteMemory = useCallback(async (id: string) => {
    try {
      await apiDeleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast("记忆已删除");
    } catch {
      toast.error("删除失败");
    }
  }, []);

  const updateMemory = useCallback(
    async (id: string, fields: { content?: string; importance?: number }) => {
      try {
        await apiUpdateMemory(id, fields);
        setMemories((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...fields } : m)),
        );
        toast("已更新");
      } catch {
        toast.error("更新失败");
      }
    },
    [],
  );

  return { memories, loading, hasMore, loadMore, deleteMemory, updateMemory, refetch: fetchMemories };
}
