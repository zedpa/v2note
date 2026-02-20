"use client";

import { useState, useMemo, useCallback } from "react";
import type { NoteItem, Review } from "@/shared/lib/types";

export interface TreeDay {
  date: string; // "2026-02-05"
  dayOfMonth: number;
  weekday: string;
  notes: NoteItem[];
  review?: Review;
}

export interface TreeWeek {
  weekNum: number;
  startDate: string;
  endDate: string;
  days: TreeDay[];
  review?: Review;
}

export interface TreeMonth {
  month: number;
  weeks: TreeWeek[];
  review?: Review;
}

export interface TreeYear {
  year: number;
  months: TreeMonth[];
  review?: Review;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getISOWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekRange(d: Date): { start: string; end: string } {
  const day = d.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateStr(monday),
    end: toDateStr(sunday),
  };
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return { start: toDateStr(first), end: toDateStr(last) };
}

function buildTree(
  notes: NoteItem[],
  reviewMap: Map<string, Review>,
): TreeYear[] {
  const yearMap = new Map<number, Map<number, Map<string, NoteItem[]>>>();

  for (const note of notes) {
    const dt = new Date(note.created_at);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const dateStr = toDateStr(dt);

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    const dayMap = monthMap.get(month)!;
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
    dayMap.get(dateStr)!.push(note);
  }

  const years: TreeYear[] = [];

  for (const [year, monthMap] of yearMap) {
    const months: TreeMonth[] = [];

    for (const [month, dayMap] of monthMap) {
      // Group days into weeks
      const weekMap = new Map<number, { weekNum: number; startDate: string; endDate: string; days: Map<string, NoteItem[]> }>();

      for (const [dateStr, dayNotes] of dayMap) {
        const dt = new Date(dateStr + "T12:00:00");
        const weekNum = getISOWeekNumber(dt);
        const { start, end } = getWeekRange(dt);

        if (!weekMap.has(weekNum)) {
          weekMap.set(weekNum, { weekNum, startDate: start, endDate: end, days: new Map() });
        }
        weekMap.get(weekNum)!.days.set(dateStr, dayNotes);
      }

      const weeks: TreeWeek[] = [];
      for (const [, weekData] of weekMap) {
        const days: TreeDay[] = [];
        for (const [dateStr, dayNotes] of weekData.days) {
          const dt = new Date(dateStr + "T12:00:00");
          days.push({
            date: dateStr,
            dayOfMonth: dt.getDate(),
            weekday: WEEKDAYS[dt.getDay()],
            notes: dayNotes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
            review: reviewMap.get(`daily:${dateStr}`),
          });
        }
        days.sort((a, b) => b.date.localeCompare(a.date));

        weeks.push({
          weekNum: weekData.weekNum,
          startDate: weekData.startDate,
          endDate: weekData.endDate,
          days,
          review: reviewMap.get(`weekly:${weekData.startDate}`),
        });
      }
      weeks.sort((a, b) => b.startDate.localeCompare(a.startDate));

      const { start: mStart, end: mEnd } = getMonthRange(year, month);
      months.push({
        month,
        weeks,
        review: reviewMap.get(`monthly:${mStart}`),
      });
    }
    months.sort((a, b) => b.month - a.month);

    years.push({
      year,
      months,
      review: reviewMap.get(`yearly:${year}-01-01`),
    });
  }

  years.sort((a, b) => b.year - a.year);
  return years;
}

export function useNotesTree(
  notes: NoteItem[],
  reviewMap: Map<string, Review>,
  activeTag?: string,
) {
  // Expand/collapse state
  const [expanded, setExpanded] = useState<Map<string, boolean>>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const wn = getISOWeekNumber(now);
    const d = toDateStr(now);
    const init = new Map<string, boolean>();
    init.set(String(y), true);
    init.set(`${y}-${m}`, true);
    init.set(`${y}-W${wn}`, true);
    init.set(d, true);
    return init;
  });

  // Filter notes by tag (keep hierarchy if any child matches)
  const filteredNotes = useMemo(() => {
    if (!activeTag) return notes;
    return notes.filter((n) =>
      n.tags.some((t) => t === activeTag),
    );
  }, [notes, activeTag]);

  const tree = useMemo(
    () => buildTree(filteredNotes, reviewMap),
    [filteredNotes, reviewMap],
  );

  const isExpanded = useCallback(
    (key: string) => expanded.get(key) ?? false,
    [expanded],
  );

  const toggleNode = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Map(prev);
      next.set(key, !prev.get(key));
      return next;
    });
  }, []);

  // Collapse day's notes, showing only the day review
  const collapseToReview = useCallback((dayKey: string) => {
    setExpanded((prev) => {
      const next = new Map(prev);
      next.set(dayKey, false);
      return next;
    });
  }, []);

  return { tree, isExpanded, toggleNode, collapseToReview };
}
