"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltipIndex(selected);
    timerRef.current = setTimeout(() => setTooltipIndex(null), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [selected]);

  // Scene 5: 左右滑动切换目标
  const handleSwipe = useCallback(
    (e: React.TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      const dx = endX - startXRef.current;
      if (Math.abs(dx) > 50) {
        if (dx < 0 && selected < goals.length - 1) {
          onSelect(selected + 1);
        } else if (dx > 0 && selected > 0) {
          onSelect(selected - 1);
        }
      }
    },
    [selected, goals.length, onSelect],
  );

  if (goals.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="flex justify-center gap-2.5 py-2"
      onTouchStart={(e) => { startXRef.current = e.touches[0].clientX; }}
      onTouchEnd={handleSwipe}
    >
      {goals.map((goal, i) => (
        <button
          key={goal.goalId}
          type="button"
          className="relative flex flex-col items-center"
          onClick={() => onSelect(i)}
        >
          {tooltipIndex === i && (
            <span className="absolute -top-5 whitespace-nowrap text-[10px] text-muted-accessible animate-fade-out">
              {goal.goalName}
            </span>
          )}
          <span
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              i === selected
                ? "bg-deer scale-125"
                : "bg-muted-accessible/30",
            )}
          />
        </button>
      ))}
    </div>
  );
}
