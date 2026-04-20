"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getDeviceId } from "@/shared/lib/device";
import { on } from "@/features/recording/lib/events";
import { fabNotify } from "@/shared/lib/fab-notify";
import type { NoteItem } from "@/shared/lib/types";
import { getCachedNotes, setCachedNotes } from "@/features/workspace/lib/cache";
import { listRecords, deleteRecords as apiDeleteRecords, updateRecord } from "@/shared/lib/api/records";

interface DateGroup {
  date: string;
  notes: NoteItem[];
}

// spec: fix-oss-image-traffic-storm.md 场景 4/5/6 — 轮询需要死线和可见性感知
// 默认 5 秒一轮，最多 10 分钟（=120 轮）；测试模式下 env 压缩到秒级
const POLL_INTERVAL =
  Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 5000;
const POLL_MAX_MS =
  Number(process.env.NEXT_PUBLIC_POLL_MAX_MS) || 10 * 60 * 1000;
const MAX_POLL_ROUNDS = Math.max(1, Math.ceil(POLL_MAX_MS / POLL_INTERVAL));

export function useNotes(notebook?: string | null, wikiPageId?: string | null) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollRoundsRef = useRef(0);
  const initialLoadDone = useRef(false);

  // 缓存优先：主时间线首次渲染时立即显示缓存，跳过 loading 态
  const cacheLoadedRef = useRef(false);
  useEffect(() => {
    if (cacheLoadedRef.current || notebook) return;
    cacheLoadedRef.current = true;
    getCachedNotes().then((cached) => {
      if (cached && cached.length > 0) {
        setNotes(cached);
        setLoading(false);        // 有缓存就不显示 loading
        initialLoadDone.current = true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotes = useCallback(async (silent = false): Promise<boolean> => {
    try {
      // 有缓存数据时静默刷新，不闪 loading
      if (!silent && notes.length === 0) setLoading(true);
      await getDeviceId(); // ensure deviceId is set in api client

      const fetchOpts: Parameters<typeof listRecords>[0] = {};
      if (notebook !== undefined && notebook !== null) fetchOpts.notebook = notebook;
      if (wikiPageId) fetchOpts.wiki_page_id = wikiPageId;
      const hasOpts = Object.keys(fetchOpts).length > 0;

      const records = await listRecords(hasOpts ? fetchOpts : undefined);

      const items: NoteItem[] = records.map((r: any) => {
        const summary = r.summary;
        const transcript = r.transcript?.text ?? "";
        const tags = (r.tags ?? []).map((t: any) => t.name).filter(Boolean);
        const hierarchy_tags = Array.isArray(r.hierarchy_tags) ? r.hierarchy_tags : [];

        const dt = new Date(r.created_at);
        const date = `${dt.getMonth() + 1}月${dt.getDate()}日`;
        const time = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;

        // Fallback: use transcript when summary is not available yet
        const title = summary?.title || transcript.slice(0, 50) || "处理中...";
        const short_summary = summary?.short_summary || transcript.slice(0, 200) || "";

        // Only show audio_path when it's a valid URL
        const audioPath = r.audio_path && r.audio_path.startsWith("http") ? r.audio_path : null;

        return {
          id: r.id,
          title,
          short_summary,
          tags,
          hierarchy_tags,
          date,
          time,
          location: r.location_text,
          status: r.status,
          duration_seconds: r.duration_seconds,
          audio_path: audioPath,
          file_url: r.file_url ?? null,
          file_name: r.file_name ?? null,
          created_at: r.created_at,
          domain: r.domain ?? null,
          source: r.source ?? null,
          source_type: r.source_type ?? null,
        };
      });

      setNotes(items);
      setError(null);
      initialLoadDone.current = true;

      // Update local cache (only for main timeline)
      if (!notebook) setCachedNotes(items);
      return true;
    } catch (e: any) {
      setError(e.message ?? "Failed to load notes");
      return false;
    } finally {
      if (!initialLoadDone.current) setLoading(false);
      else setLoading(false);
    }
  }, [notebook, wikiPageId]);

  // Start/stop polling based on whether any notes are still processing
  // spec: fix-oss-image-traffic-storm.md 场景 4/5/6
  //   - 达到 MAX_POLL_ROUNDS 后停止，页面提示"自动刷新已暂停"
  //   - 页面不可见时跳过本轮（不消耗计数）
  //   - 只要无 processing/uploading 就彻底关 timer（场景 6）
  useEffect(() => {
    const hasProcessing = notes.some(
      (n) =>
        n.status === "uploading" ||
        n.status === "uploaded" ||
        n.status === "processing",
    );

    // 没有需要轮询的记录 → 关掉 timer，同时重置暂停态（下次有 processing 又会启动）
    if (!hasProcessing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      pollRoundsRef.current = 0;
      if (autoRefreshPaused) setAutoRefreshPaused(false);
      return;
    }

    // 已经暂停或 timer 已存在 → 不重复启动
    if (autoRefreshPaused || pollRef.current) return;

    pollRef.current = setInterval(() => {
      // 页面不可见 → 跳过本轮（不消耗次数）
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      pollRoundsRef.current += 1;
      if (pollRoundsRef.current > MAX_POLL_ROUNDS) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setAutoRefreshPaused(true);
        return;
      }
      void fetchNotes(true);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [notes, fetchNotes, autoRefreshPaused]);

  // 页面从 hidden → visible 时：重置计数 + 立即拉一次 + 若已暂停则恢复
  // spec: fix-oss-image-traffic-storm.md 场景 5
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState === "visible") {
        pollRoundsRef.current = 0;
        if (autoRefreshPaused) setAutoRefreshPaused(false);
        void fetchNotes(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchNotes, autoRefreshPaused]);

  // Reset on notebook/wikiPageId change
  useEffect(() => {
    setNotes([]);
    initialLoadDone.current = false;
  }, [notebook, wikiPageId]);

  // Initial fetch + event listeners
  useEffect(() => {
    fetchNotes();

    const unsubUploaded = on("recording:uploaded", () => fetchNotes(true));
    const unsubProcessed = on("recording:processed", () => fetchNotes(true));

    return () => {
      unsubUploaded();
      unsubProcessed();
    };
  }, [fetchNotes]);

  const groupByDate = useCallback((): DateGroup[] => {
    const groups: DateGroup[] = [];
    for (const note of notes) {
      const existing = groups.find((g) => g.date === note.date);
      if (existing) {
        existing.notes.push(note);
      } else {
        groups.push({ date: note.date, notes: [note] });
      }
    }
    return groups;
  }, [notes]);

  const deleteNotes = useCallback(
    async (ids: string[]) => {
      try {
        await apiDeleteRecords(ids);
        setNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
        fabNotify.info(`已删除 ${ids.length} 条笔记`);
      } catch (e: any) {
        fabNotify.error(`删除失败: ${e.message}`);
      }
    },
    [],
  );

  const archiveNotes = useCallback(
    async (ids: string[]) => {
      try {
        for (const id of ids) {
          await updateRecord(id, { archived: true });
        }
        setNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
        fabNotify.info(`已归档 ${ids.length} 条笔记`);
      } catch (e: any) {
        fabNotify.error(`归档失败: ${e.message}`);
      }
    },
    [],
  );

  const updateNote = useCallback(
    async (id: string, fields: { short_summary: string }) => {
      try {
        await updateRecord(id, fields);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, short_summary: fields.short_summary } : n,
          ),
        );
        fabNotify.info("已保存");
      } catch (e: any) {
        fabNotify.error(`保存失败: ${e.message}`);
      }
    },
    [],
  );

  // 外部下拉刷新：重置计数 + 恢复自动刷新 + 拉一次
  // spec: fix-oss-image-traffic-storm.md 场景 4 "下拉可恢复"
  const refresh = useCallback(async () => {
    pollRoundsRef.current = 0;
    if (autoRefreshPaused) setAutoRefreshPaused(false);
    return fetchNotes(true);
  }, [fetchNotes, autoRefreshPaused]);

  return {
    notes,
    loading,
    error,
    refetch: fetchNotes,
    refresh,
    autoRefreshPaused,
    groupByDate,
    deleteNotes,
    archiveNotes,
    updateNote,
  };
}
