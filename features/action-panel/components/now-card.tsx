"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ActionCard } from "@/shared/lib/api/action-panel";
import { reportSwipe } from "@/shared/lib/api/action-panel";

const ACTION_ICONS: Record<string, string> = {
  call: "📞",
  write: "📝",
  review: "👁",
  think: "💭",
  record: "🎙",
};

type SkipReason = "wait" | "blocked" | "rethink";

interface NowCardProps {
  card: ActionCard;
  onComplete: (strikeId: string) => void;
  onSkip: (strikeId: string, reason?: SkipReason) => void;
  onTraverse?: (strikeId: string) => void;
}

type SwipePhase = "idle" | "swiping" | "forking" | "dropping";

export function NowCard({ card, onComplete, onSkip, onTraverse }: NowCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [phase, setPhase] = useState<SwipePhase>("idle");
  const [transitioning, setTransitioning] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const widthRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const forkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const forkedRef = useRef(false);
  const phaseRef = useRef<SwipePhase>("idle");

  // Long-press traverse
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);

  const setPhaseSync = useCallback((p: SwipePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const resetCard = useCallback(() => {
    setTransitioning(true);
    setOffsetX(0);
    setOffsetY(0);
    setPhaseSync("idle");
    forkedRef.current = false;
    if (forkTimerRef.current) {
      clearTimeout(forkTimerRef.current);
      forkTimerRef.current = null;
    }
    setTimeout(() => setTransitioning(false), 300);
  }, [setPhaseSync]);

  const flyOut = useCallback(
    (direction: "left" | "right", cb: () => void) => {
      setTransitioning(true);
      setOffsetX(direction === "right" ? widthRef.current * 1.2 : -widthRef.current * 1.2);
      setTimeout(() => {
        cb();
        setOffsetX(0);
        setOffsetY(0);
        setPhaseSync("idle");
        setTransitioning(false);
        forkedRef.current = false;
      }, 300);
    },
    [setPhaseSync],
  );

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current !== "idle") return;
      const el = containerRef.current;
      if (!el) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      widthRef.current = el.offsetWidth;
      forkedRef.current = false;
      longPressFiredRef.current = false;

      // Start long-press timer for traverse
      clearLongPress();
      if (onTraverse) {
        longPressTimerRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          onTraverse(card.strikeId);
        }, 500);
      }

      setPhaseSync("swiping");
    },
    [setPhaseSync, clearLongPress, onTraverse, card.strikeId],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = phaseRef.current;
      if (p !== "swiping" && p !== "forking" && p !== "dropping") return;

      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;

      // Cancel long-press if pointer moved > 10px
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearLongPress();
      }
      const ratio = Math.abs(dx) / widthRef.current;

      // Left swipe fork zone: 30-40%
      if (dx < 0 && ratio >= 0.3 && ratio < 0.4 && !forkedRef.current) {
        forkedRef.current = true;
        setPhaseSync("forking");
        // Pause at this position
        setOffsetX(dx);
        if (forkTimerRef.current) clearTimeout(forkTimerRef.current);
        forkTimerRef.current = setTimeout(() => {
          // After pause, allow continued movement
          forkedRef.current = true;
        }, 300);
        return;
      }

      // In forking phase, detect downward pull
      if (p === "forking" || p === "dropping") {
        if (dy > 40) {
          setPhaseSync("dropping");
          setOffsetY(dy - 40);
        }
        // Allow continued left swipe past fork zone
        if (ratio >= 0.4 && dy <= 40) {
          setPhaseSync("swiping");
        } else {
          return;
        }
      }

      setOffsetX(dx);
    },
    [setPhaseSync],
  );

  const onPointerUp = useCallback(
    (_e: React.PointerEvent) => {
      clearLongPress();
      const p = phaseRef.current;
      if (p === "idle") return;

      // If long-press already fired, just reset card
      if (longPressFiredRef.current) {
        resetCard();
        return;
      }

      const ratio = Math.abs(offsetX) / (widthRef.current || 1);

      // Dropping = fork reason based on position
      if (p === "dropping") {
        const dropX = Math.abs(offsetX);
        const dropZone = widthRef.current / 3;
        let reason: SkipReason;
        if (dropX < dropZone) {
          reason = "wait";
        } else if (dropX < dropZone * 2) {
          reason = "blocked";
        } else {
          reason = "rethink";
        }
        reportSwipe({ strikeId: card.strikeId, direction: "left", reason });
        flyOut("left", () => onSkip(card.strikeId, reason));
        return;
      }

      // Right swipe > 40% = complete
      if (offsetX > 0 && ratio > 0.4) {
        reportSwipe({ strikeId: card.strikeId, direction: "right" });
        flyOut("right", () => onComplete(card.strikeId));
        return;
      }

      // Left swipe > 40% = skip (稍后再说)
      if (offsetX < 0 && ratio > 0.4) {
        reportSwipe({ strikeId: card.strikeId, direction: "left", reason: "later" });
        flyOut("left", () => onSkip(card.strikeId));
        return;
      }

      // Forking without committing = cancel
      resetCard();
    },
    [offsetX, card.strikeId, onComplete, onSkip, flyOut, resetCard, clearLongPress],
  );

  const onPointerCancel = useCallback(() => {
    clearLongPress();
    resetCard();
  }, [resetCard, clearLongPress]);

  const ratio = widthRef.current ? Math.abs(offsetX) / widthRef.current : 0;
  const isRight = offsetX > 0;
  const icon = ACTION_ICONS[card.actionType] ?? "▶";

  return (
    <div ref={containerRef} className="relative select-none touch-none">
      {/* Swipe background layers */}
      <div
        className={cn(
          "absolute inset-0 rounded-2xl flex items-center px-6 transition-opacity",
          isRight ? "bg-green-500/20 justify-start" : "bg-muted/20 justify-end",
        )}
        style={{ opacity: Math.min(ratio * 2, 1) }}
      >
        <span className="text-2xl">{isRight ? "✓" : "→"}</span>
      </div>

      {/* Fork options (visible during forking/dropping) */}
      {(phase === "forking" || phase === "dropping") && (
        <div className="absolute inset-x-0 bottom-0 translate-y-full pt-2 flex justify-center gap-3 z-10">
          <span className="px-3 py-1.5 rounded-full bg-muted text-xs">⏳等条件</span>
          <span className="px-3 py-1.5 rounded-full bg-muted text-xs">🚧有阻力</span>
          <span className="px-3 py-1.5 rounded-full bg-muted text-xs">🔄要重想</span>
        </div>
      )}

      {/* Card */}
      <div
        className={cn(
          "relative rounded-2xl border bg-card p-5 shadow-sm",
          transitioning && "transition-transform duration-300 ease-out",
        )}
        style={{
          transform: `translateX(${offsetX}px) translateY(${offsetY}px)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Goal name */}
        <div className="text-xs text-muted-foreground mb-1.5">{card.goalName}</div>

        {/* Action */}
        <div className="flex items-start gap-2.5">
          <span className="text-xl shrink-0 mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium leading-snug">{card.action}</div>
            {card.context && (
              <div className="text-sm text-muted-foreground mt-1">{card.context}</div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          {card.targetPerson && <span>→ {card.targetPerson}</span>}
          {card.durationEstimate && <span>⏱ {card.durationEstimate}</span>}
        </div>
      </div>
    </div>
  );
}
