"use client";

import { useRef, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useActionPanel } from "../hooks/use-action-panel";
import { NowCard } from "./now-card";
import { TodayLine } from "./today-line";
import { GoalIndicator } from "./goal-indicator";

interface ActionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActionPanel({ isOpen, onClose }: ActionPanelProps) {
  const { now, today, goals, currentGoalIndex, switchGoal } = useActionPanel();

  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - startYRef.current;
      if (dy > 0) setDragY(dy);
    },
    [dragging],
  );

  const onPointerUp = useCallback(() => {
    if (dragY > 100) {
      onClose();
    }
    setDragY(0);
    setDragging(false);
  }, [dragY, onClose]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[60vh]",
          "rounded-t-3xl bg-background/80 backdrop-blur-xl",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={{
          transform: isOpen
            ? `translateY(${dragY}px)`
            : "translateY(100%)",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { setDragY(0); setDragging(false); }}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 pb-8 space-y-5" style={{ maxHeight: "calc(60vh - 40px)" }}>
          {now && (
            <NowCard
              card={now}
              onComplete={(id) => console.log("complete", id)}
              onSkip={(id) => console.log("skip", id)}
            />
          )}

          <TodayLine items={today} />

          {goals.length > 1 && (
            <GoalIndicator
              goals={goals}
              selected={currentGoalIndex}
              onSelect={switchGoal}
            />
          )}
        </div>
      </div>
    </>
  );
}
