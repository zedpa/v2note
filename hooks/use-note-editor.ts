"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { NoteDetail, Tag } from "@/lib/types";

export function useNoteEditor(detail: NoteDetail | null, refetch: () => void) {
  const [editing, setEditing] = useState<string | null>(null); // which section is being edited

  const startEdit = useCallback((section: string) => setEditing(section), []);
  const cancelEdit = useCallback(() => setEditing(null), []);

  const saveTitle = useCallback(async (title: string) => {
    if (!detail?.summary) return;
    const { error } = await supabase
      .from("summary")
      .update({ title })
      .eq("id", detail.summary.id);
    if (error) { toast.error("保存失败"); return; }
    setEditing(null);
    refetch();
  }, [detail, refetch]);

  const saveSummary = useCallback(async (shortSummary: string) => {
    if (!detail?.summary) return;
    const { error } = await supabase
      .from("summary")
      .update({ short_summary: shortSummary, long_summary: shortSummary })
      .eq("id", detail.summary.id);
    if (error) { toast.error("保存失败"); return; }
    setEditing(null);
    refetch();
  }, [detail, refetch]);

  const addTag = useCallback(async (tagName: string) => {
    if (!detail) return;
    const { data: tagData } = await supabase
      .from("tag")
      .upsert({ name: tagName }, { onConflict: "name" })
      .select("id")
      .single();
    if (!tagData) return;
    await supabase.from("record_tag").insert({
      record_id: detail.record.id,
      tag_id: tagData.id,
    });
    refetch();
  }, [detail, refetch]);

  const removeTag = useCallback(async (tagId: string) => {
    if (!detail) return;
    await supabase
      .from("record_tag")
      .delete()
      .eq("record_id", detail.record.id)
      .eq("tag_id", tagId);
    refetch();
  }, [detail, refetch]);

  const addTodo = useCallback(async (text: string) => {
    if (!detail) return;
    await supabase.from("todo").insert({
      record_id: detail.record.id,
      text,
      done: false,
    });
    refetch();
  }, [detail, refetch]);

  const updateTodo = useCallback(async (id: string, text: string) => {
    await supabase.from("todo").update({ text }).eq("id", id);
    refetch();
  }, [refetch]);

  const deleteTodo = useCallback(async (id: string) => {
    await supabase.from("todo").delete().eq("id", id);
    refetch();
  }, [refetch]);

  const addIdea = useCallback(async (text: string) => {
    if (!detail) return;
    await supabase.from("idea").insert({
      record_id: detail.record.id,
      text,
    });
    refetch();
  }, [detail, refetch]);

  const deleteIdea = useCallback(async (id: string) => {
    await supabase.from("idea").delete().eq("id", id);
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
