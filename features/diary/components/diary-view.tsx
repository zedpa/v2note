"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, Calendar, Bot, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listDiarySummaries,
  getDiaryEntry,
  type DiarySummary,
  type DiaryEntry,
} from "@/shared/lib/api/notebooks";
import { on } from "@/features/recording/lib/events";

interface DiaryViewProps {
  notebook: string;
}

function formatDate(dateStr: string): string {
  // Handle both "2026-03-13" and "2026-03-13T00:00:00.000Z" formats
  const dateOnly = dateStr.split("T")[0];
  const d = new Date(dateOnly + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff === 2) return "前天";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${month}月${day}日 周${weekday}`;
}

function getDateStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const NOTEBOOK_COLORS: Record<string, string> = {
  "ai-self": "text-violet-500",
  default: "text-amber-500",
};

export function DiaryView({ notebook }: DiaryViewProps) {
  const [summaries, setSummaries] = useState<DiarySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh when recording is processed
  useEffect(() => {
    return on("recording:processed", () => {
      // Delay slightly to let backend finish diary append
      setTimeout(() => setRefreshKey((k) => k + 1), 2000);
    });
  }, []);

  // Load summaries
  useEffect(() => {
    setLoading(summaries.length === 0);
    listDiarySummaries(notebook, getDateStr(-30), getDateStr(0))
      .then((items) => {
        setSummaries(items);
        if (items.length > 0 && !selectedDate) setSelectedDate(items[0].entry_date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [notebook, refreshKey]);

  // Load entry detail
  useEffect(() => {
    if (!selectedDate) { setEntry(null); return; }
    setLoadingEntry(true);
    getDiaryEntry(notebook, selectedDate)
      .then(setEntry)
      .catch(() => setEntry(null))
      .finally(() => setLoadingEntry(false));
  }, [notebook, selectedDate, refreshKey]);

  const accentColor = NOTEBOOK_COLORS[notebook] ?? "text-blue-500";

  if (loading) {
    return (
      <div className="px-4 space-y-3 pt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl p-5 bg-card shadow-sm">
            <div className="h-2.5 animate-shimmer rounded w-24 mb-3" />
            <div className="h-3 animate-shimmer rounded w-full mb-2" />
            <div className="h-3 animate-shimmer rounded w-3/4" style={{ animationDelay: "0.15s" }} />
          </div>
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8">
        <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4">
          <BookOpen className="w-7 h-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium text-muted-foreground/60">
          还没有日记内容
        </p>
        <p className="text-xs text-muted-foreground/40 mt-1">
          AI 会在与你互动时自动记录
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-28">
      {summaries.map((s) => {
        const isSelected = selectedDate === s.entry_date;
        return (
          <div key={s.id} className="mb-3">
            {/* Date card */}
            <button
              type="button"
              onClick={() => setSelectedDate(isSelected ? null : s.entry_date)}
              className={cn(
                "w-full rounded-2xl p-5 text-left transition-all duration-200",
                "bg-card shadow-sm hover:shadow-md",
                isSelected && "ring-1 ring-foreground/10",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar className={cn("w-4 h-4", isSelected ? accentColor : "text-muted-foreground/40")} />
                <span className="text-sm font-semibold text-foreground/80">
                  {formatDate(s.entry_date)}
                </span>
              </div>
              {s.summary && (
                <p className={cn(
                  "text-[13px] leading-relaxed text-muted-foreground",
                  !isSelected && "line-clamp-2",
                )}>
                  {s.summary}
                </p>
              )}
            </button>

            {/* Expanded content */}
            {isSelected && (
              <div className="mt-2 ml-2 pl-4 border-l-2 border-foreground/8">
                {loadingEntry ? (
                  <div className="py-6 flex justify-center">
                    <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                  </div>
                ) : entry?.full_content ? (
                  <div className="py-3 text-sm text-foreground/85 leading-[1.8] whitespace-pre-wrap">
                    {entry.full_content}
                  </div>
                ) : (
                  <p className="py-4 text-xs text-muted-foreground/40 text-center">
                    无详细内容
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
