"use client";

import { useState, useEffect, useCallback } from "react";
import {
  SYSTEM_TAGS,
  getCustomTags,
  addCustomTag,
  removeCustomTag,
  getAvailableTags,
} from "@/lib/tag-manager";
import { on } from "@/lib/events";

export function useTags() {
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    try {
      const custom = await getCustomTags();
      setCustomTags(custom);
    } catch {
      // silently fail — tags are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
    const unsub = on("recording:processed", fetchTags);
    return unsub;
  }, [fetchTags]);

  const tags = getAvailableTags(customTags);

  const addTag = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if ((SYSTEM_TAGS as readonly string[]).includes(trimmed)) return;
    if (customTags.includes(trimmed)) return;
    await addCustomTag(trimmed);
    setCustomTags((prev) => [...prev, trimmed]);
  }, [customTags]);

  const removeTag = useCallback(async (name: string) => {
    if ((SYSTEM_TAGS as readonly string[]).includes(name)) return;
    await removeCustomTag(name);
    setCustomTags((prev) => prev.filter((t) => t !== name));
  }, []);

  const isSystemTag = useCallback((name: string) => {
    return (SYSTEM_TAGS as readonly string[]).includes(name);
  }, []);

  return { tags, customTags, loading, addTag, removeTag, isSystemTag, refetch: fetchTags };
}
