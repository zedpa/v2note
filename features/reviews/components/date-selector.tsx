"use client";

import { cn } from "@/lib/utils";
import { Calendar, Clock, CalendarDays, Infinity } from "lucide-react";
import type { Review } from "@/shared/lib/types";

type PeriodType = Review["period"];

interface DateSelectorProps {
  onGenerate: (period: PeriodType, start: string, end: string) => void;
  generating: boolean;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

const SHORTCUTS = [
  {
    label: "近7天",
    icon: Clock,
    period: "weekly" as PeriodType,
    getRange: () => ({ from: daysAgo(7), to: endOfToday() }),
  },
  {
    label: "近1月",
    icon: Calendar,
    period: "monthly" as PeriodType,
    getRange: () => ({ from: daysAgo(30), to: endOfToday() }),
  },
  {
    label: "近半年",
    icon: CalendarDays,
    period: "monthly" as PeriodType,
    getRange: () => ({ from: daysAgo(180), to: endOfToday() }),
  },
  {
    label: "全部日记",
    icon: Infinity,
    period: "monthly" as PeriodType,
    getRange: () => ({ from: new Date("2020-01-01"), to: endOfToday() }),
  },
];

export function DateSelector({ onGenerate, generating }: DateSelectorProps) {
  const handleClick = (shortcut: (typeof SHORTCUTS)[number]) => {
    if (generating) return;
    const { from, to } = shortcut.getRange();
    onGenerate(shortcut.period, from.toISOString(), to.toISOString());
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">选择复盘范围</p>
      <div className="grid grid-cols-2 gap-3">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              type="button"
              disabled={generating}
              onClick={() => handleClick(s)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border border-border/60",
                "hover:bg-secondary/60 hover:border-primary/30 transition-all",
                "active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
              )}
            >
              <Icon className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          );
        })}
      </div>
      {generating && (
        <p className="text-xs text-center text-muted-foreground animate-pulse">
          正在生成复盘...
        </p>
      )}
    </div>
  );
}
