"use client";

import { useRef, useCallback, useMemo } from "react";

interface CalendarStripProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
}

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 获取 date 所在周的周一
 */
function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 周日 → 前推6天
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * 生成以 anchorDate 为中心的 5 周日期（35 天）
 */
function generateWeeks(anchorDate: string): string[] {
  const monday = getMonday(anchorDate);
  // 前推 2 周
  monday.setDate(monday.getDate() - 14);
  const days: string[] = [];
  for (let i = 0; i < 35; i++) {
    days.push(formatDate(monday));
    monday.setDate(monday.getDate() + 1);
  }
  return days;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function CalendarStrip({ selectedDate, onDateChange }: CalendarStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const days = useMemo(() => generateWeeks(selectedDate), [selectedDate]);

  // 找到选中日所在周的起始索引（中间周 = index 14~20）
  const selectedWeekStart = useMemo(() => {
    const idx = days.indexOf(selectedDate);
    return Math.floor(idx / 7) * 7;
  }, [days, selectedDate]);

  // 只显示选中日所在周
  const weekDays = days.slice(selectedWeekStart, selectedWeekStart + 7);

  const handleDateClick = useCallback(
    (dateStr: string) => {
      onDateChange(dateStr);
    },
    [onDateChange],
  );

  return (
    <div
      ref={scrollRef}
      data-testid="calendar-strip"
      className="flex justify-between px-5 pb-6"
    >
      {weekDays.map((dateStr) => {
        const d = new Date(dateStr + "T00:00:00");
        const dayNum = d.getDate();
        const weekdayIdx = d.getDay();
        const isSelected = dateStr === selectedDate;
        const isToday = dateStr === today;

        return (
          <button
            key={dateStr}
            onClick={() => handleDateClick(dateStr)}
            className="flex flex-col items-center gap-2"
          >
            <span
              className={`text-[13px] ${
                isSelected ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {WEEKDAY_SHORT[weekdayIdx]}
            </span>
            <div className="relative">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-base font-semibold ${
                  isSelected
                    ? "border border-border bg-card text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {dayNum}
              </div>
              {/* 今天的红点 */}
              {isToday && !isSelected && (
                <div className="absolute -top-0.5 right-0 h-1.5 w-1.5 rounded-full bg-destructive" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
