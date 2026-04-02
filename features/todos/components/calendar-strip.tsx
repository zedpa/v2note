"use client";

import { useRef, useCallback, useMemo } from "react";
import { toLocalDateStr, getLocalToday } from "../lib/date-utils";
import type { DotColor } from "../lib/date-dots";

interface CalendarStripProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  dateDots?: Map<string, DotColor>;
}

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

const DOT_COLORS: Record<DotColor, string> = {
  red: "bg-red-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
};

/** 获取 date 所在周的周一 */
function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** 生成某周一开始的 7 天 */
function generateWeek(mondayDate: Date): string[] {
  const days: string[] = [];
  const d = new Date(mondayDate);
  for (let i = 0; i < 7; i++) {
    days.push(toLocalDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function CalendarStrip({ selectedDate, onDateChange, dateDots }: CalendarStripProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const today = useMemo(() => getLocalToday(), []);

  const weekDays = useMemo(() => {
    const monday = getMonday(selectedDate);
    return generateWeek(monday);
  }, [selectedDate]);

  // 滑动切换周
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      // 水平位移 > 垂直位移，且超过 50px
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        const current = new Date(selectedDate + "T00:00:00");
        const offset = dx < 0 ? 7 : -7; // 左滑 → 下一周
        current.setDate(current.getDate() + offset);
        onDateChange(toLocalDateStr(current));
      }
    },
    [selectedDate, onDateChange],
  );

  return (
    <div
      data-testid="calendar-strip"
      className="flex justify-between px-5 pb-6"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {weekDays.map((dateStr) => {
        const d = new Date(dateStr + "T00:00:00");
        const dayNum = d.getDate();
        const weekdayIdx = d.getDay();
        const isSelected = dateStr === selectedDate;
        const isToday = dateStr === today;
        const dotColor = dateDots?.get(dateStr);

        return (
          <button
            key={dateStr}
            onClick={() => onDateChange(dateStr)}
            className="flex flex-col items-center gap-2 select-none active:scale-95 transition-transform"
          >
            <span
              className={`text-[13px] ${
                isSelected ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {WEEKDAY_SHORT[weekdayIdx]}
            </span>
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-base font-semibold ${
                isSelected
                  ? "border border-border bg-card text-foreground"
                  : isToday
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground"
              }`}
            >
              {dayNum}
            </div>
            {/* 日期圆点 */}
            <div className="h-1.5">
              {dotColor && (
                <div className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[dotColor]}`} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
