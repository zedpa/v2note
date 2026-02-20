"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Review } from "@/shared/lib/types";

type PeriodType = Review["period"];

interface DateSelectorProps {
  onGenerate: (period: PeriodType, start: string, end: string) => void;
  generating: boolean;
}

function getWeekRange(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { from: monday, to: sunday };
}

function getMonthRange(offset: number) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

const SHORTCUTS = [
  { label: "本周", fn: () => getWeekRange(0) },
  { label: "上周", fn: () => getWeekRange(-1) },
  { label: "本月", fn: () => getMonthRange(0) },
  { label: "上月", fn: () => getMonthRange(-1) },
];

export function DateSelector({ onGenerate, generating }: DateSelectorProps) {
  const [period, setPeriod] = useState<PeriodType>("weekly");
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const handleShortcut = (from: Date, to: Date) => {
    setRange({ from, to });
  };

  const handleGenerate = () => {
    if (!range?.from || !range?.to) return;
    onGenerate(period, range.from.toISOString(), range.to.toISOString());
  };

  return (
    <div className="space-y-4">
      {/* Period type pills */}
      <div className="flex gap-2">
        {(["daily", "weekly", "monthly"] as PeriodType[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              period === p
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary",
            )}
          >
            {p === "daily" ? "日" : p === "weekly" ? "周" : "月"}
          </button>
        ))}
      </div>

      {/* Shortcuts */}
      <div className="flex gap-2 flex-wrap">
        {SHORTCUTS.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              const r = s.fn();
              handleShortcut(r.from, r.to);
            }}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* Calendar */}
      <div className="flex justify-center">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          numberOfMonths={1}
          disabled={{ after: new Date() }}
        />
      </div>

      {/* Selected range display */}
      {range?.from && range?.to && (
        <p className="text-xs text-muted-foreground text-center">
          {range.from.toLocaleDateString("zh-CN")} - {range.to.toLocaleDateString("zh-CN")}
        </p>
      )}

      {/* Generate button */}
      <Button
        className="w-full"
        onClick={handleGenerate}
        disabled={!range?.from || !range?.to || generating}
      >
        {generating ? "生成中..." : "生成复盘"}
      </Button>
    </div>
  );
}
