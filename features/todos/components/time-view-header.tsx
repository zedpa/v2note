"use client";

import { Calendar, X } from "lucide-react";

interface TimeViewHeaderProps {
  selectedDate: string; // YYYY-MM-DD
  calendarExpanded: boolean;
  onToggleCalendar: () => void;
  onTodayClick: () => void;
}

const WEEKDAY_NAMES = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function TimeViewHeader({ selectedDate, calendarExpanded, onToggleCalendar, onTodayClick }: TimeViewHeaderProps) {
  const date = new Date(selectedDate + "T00:00:00");
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return (
    <div data-testid="time-view-header" className="flex items-end justify-between px-5 pb-6 pt-2.5">
      <div className="font-serif text-[28px] font-bold tracking-wide text-foreground">
        {calendarExpanded ? `${month}月 ${year}` : weekday}
      </div>
      <div className="flex items-center gap-2.5">
        {!calendarExpanded && (
          <span className="text-xs tracking-wider text-muted-foreground">
            {month}月 {year}
          </span>
        )}
        <button
          data-testid="calendar-toggle"
          onClick={onToggleCalendar}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors active:text-foreground"
        >
          {calendarExpanded ? <X className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
