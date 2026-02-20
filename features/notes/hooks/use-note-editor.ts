"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { NoteDetail } from "@/shared/lib/types";
import { api } from "@/shared/lib/api";
import { addTagToRecord, removeTagFromRecord } from "@/shared/lib/api/tags";
import { createTodo, updateTodo as apiUpdateTodo, deleteTodo as apiDeleteTodo } from "@/shared/lib/api/todos";
import { createIdea, deleteIdea as apiDeleteIdea } from "@/shared/lib/api/ideas";

export function useNoteEditor(detail: NoteDetail | null, refetch: () => void) {
  const [editing, setEditing] = useState<string | null>(null); // which section is being edited

  const startEdit = useCallback((section: string) => setEditing(section), []);
  const cancelEdit = useCallback(() => setEditing(null), []);

  const saveTitle = useCallback(async (title: string) => {
    if (!detail?.summary) return;
    try {
      await api.patch(`/api/v1/records/${detail.record.id}/summary`, { title });
      setEditing(null);
      refetch();
    } catch {
      toast.error("保存失败");
    }
  }, [detail, refetch]);

  const saveSummary = useCallback(async (shortSummary: string) => {
    if (!detail?.summary) return;
    try {
      await api.patch(`/api/v1/records/${detail.record.id}/summary`, {
        short_summary: shortSummary,
        long_summary: shortSummary,
      });
      setEditing(null);
      refetch();
    } catch {
      toast.error("保存失败");
    }
  }, [detail, refetch]);

  const addTag = useCallback(async (tagName: string) => {
    if (!detail) return;
    await addTagToRecord(detail.record.id, tagName);
    refetch();
  }, [detail, refetch]);

  const removeTag = useCallback(async (tagId: string) => {
    if (!detail) return;
    await removeTagFromRecord(detail.record.id, tagId);
    refetch();
  }, [detail, refetch]);

  const addTodo = useCallback(async (text: string) => {
    if (!detail) return;
    await createTodo({ record_id: detail.record.id, text });
    refetch();
  }, [detail, refetch]);

  const updateTodo = useCallback(async (id: string, text: string) => {
    await apiUpdateTodo(id, { text });
    refetch();
  }, [refetch]);

  const deleteTodo = useCallback(async (id: string) => {
    await apiDeleteTodo(id);
    refetch();
  }, [refetch]);

  const addIdea = useCallback(async (text: string) => {
    if (!detail) return;
    await createIdea({ record_id: detail.record.id, text });
    refetch();
  }, [detail, refetch]);

  const deleteIdea = useCallback(async (id: string) => {
    await apiDeleteIdea(id);
    refetch();
  }, [refetch]);

  return {
    editing,
    startEdit,
    cancelEdit,
    saveTitle,
    saveSummary,
    addTag,
    removeTag,
    addTodo,
    updateTodo,
    deleteTodo,
    addIdea,
    deleteIdea,
  };
}
