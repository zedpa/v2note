"use client";

import { cn } from "@/lib/utils";
import type { ActionItem } from "@/shared/lib/api/action-panel";

const SYMBOL_MAP: Record<ActionItem["symbol"], string> = {
  next: "●",
  scheduled: "○",
  flexible: "◇",
};

const MAX_VISIBLE = 5;

interface TodayLineProps {
  items: ActionItem[];
  className?: string;
}

export function TodayLine({ items, className }: TodayLineProps) {
  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.length - MAX_VISIBLE;

  if (items.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {visible.map((item) => (
        <div
          key={item.strikeId}
          className="flex items-center gap-2.5 py-1 text-sm"
        >
          <span className="w-4 text-center text-muted-foreground shrink-0">
            {SYMBOL_MAP[item.symbol]}
          </span>
          <span className="flex-1 min-w-0 truncate">{item.text}</span>
          {item.scheduledTime && (
            <span className="text-xs text-muted-foreground shrink-0">
              {item.scheduledTime}
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div className="text-xs text-muted-foreground pl-6.5">
          +{overflow} 项
        </div>
      )}
    </div>
  );
}
