"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { GoalIndicator as GoalIndicatorType } from "@/shared/lib/api/action-panel";

interface GoalIndicatorProps {
  goals: GoalIndicatorType[];
  selected: number;
  onSelect: (index: number) => void;
}

export function GoalIndicator({ goals, selected, onSelect }: GoalIndicatorProps) {
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltipIndex(selected);
    timerRef.current = setTimeout(() => setTooltipIndex(null), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [selected]);

  if (goals.length === 0) return null;

  return (
    <div className="flex justify-center gap-2">
      {goals.map((goal, i) => (
        <button
          key={goal.goalId}
          type="button"
          className="relative flex flex-col items-center"
          onClick={() => onSelect(i)}
        >
          {tooltipIndex === i && (
            <span className="absolute -top-5 whitespace-nowrap text-[10px] text-muted-foreground animate-fade-out">
              {goal.goalName}
            </span>
          )}
          <span
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              i === selected ? "bg-primary" : "bg-muted-foreground/30",
            )}
          />
        </button>
      ))}
    </div>
  );
}
