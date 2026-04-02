"use client";

import { useCallback, useMemo, useRef } from "react";
import { Calendar } from "@/components/ui/calendar";
import { CalendarStrip } from "./calendar-strip";
import { toLocalDateStr } from "../lib/date-utils";
import type { DotColor } from "../lib/date-dots";

interface CalendarExpandProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  expanded: boolean;
  onCollapse: () => void;
  dateDots: Map<string, DotColor>;
}

const DOT_CSS: Record<DotColor, string> = {
  red: "after:bg-red-500",
  green: "after:bg-emerald-500",
  yellow: "after:bg-amber-400",
};

export function CalendarExpand({
  selectedDate,
  onDateChange,
  expanded,
  onCollapse,
  dateDots,
}: CalendarExpandProps) {
  const touchStartRef = useRef<{ y: number } | null>(null);

  // react-day-picker modifiers：按圆点颜色分组
  const modifiers = useMemo(() => {
    const red: Date[] = [];
    const green: Date[] = [];
    const yellow: Date[] = [];

    for (const [dateStr, color] of dateDots) {
      const d = new Date(dateStr + "T00:00:00");
      if (color === "red") red.push(d);
      else if (color === "green") green.push(d);
      else if (color === "yellow") yellow.push(d);
    }

    return { dotRed: red, dotGreen: green, dotYellow: yellow };
  }, [dateDots]);

  const modifiersClassNames = useMemo(
    () => ({
      dotRed: "dot-indicator dot-red",
      dotGreen: "dot-indicator dot-green",
      dotYellow: "dot-indicator dot-yellow",
    }),
    [],
  );

  const handleSelect = useCallback(
    (day: Date | undefined) => {
      if (!day) return;
      onDateChange(toLocalDateStr(day));
      onCollapse();
    },
    [onDateChange, onCollapse],
  );

  // 下拉/上拉手势
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (!expanded && dy > 40) {
        // 向下拖 → 不在此处处理（由父组件 toggle）
      } else if (expanded && dy < -40) {
        onCollapse();
      }
    },
    [expanded, onCollapse],
  );

  const selectedDay = useMemo(
    () => new Date(selectedDate + "T00:00:00"),
    [selectedDate],
  );

  if (!expanded) {
    return (
      <CalendarStrip
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        dateDots={dateDots}
      />
    );
  }

  return (
    <div
      data-testid="calendar-expand"
      className="overflow-hidden transition-all duration-300 ease-in-out"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style jsx global>{`
        .dot-indicator {
          position: relative;
        }
        .dot-indicator::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }
        .dot-red::after { background-color: #ef4444; }
        .dot-green::after { background-color: #10b981; }
        .dot-yellow::after { background-color: #f59e0b; }
      `}</style>
      <Calendar
        mode="single"
        selected={selectedDay}
        onSelect={handleSelect}
        defaultMonth={selectedDay}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        weekStartsOn={1}
        className="mx-auto"
      />
    </div>
  );
}
