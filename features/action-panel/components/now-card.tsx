"use client";

import { useState, useRef, useCallback } from "react";
import { MessageCircle } from "lucide-react";
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
  onReflect?: (strikeId: string) => void;
}

type SwipePhase = "idle" | "swiping" | "forking" | "dropping";

export function NowCard({ card, onComplete, onSkip, onTraverse, onReflect }: NowCardProps) {
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

      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearLongPress();
      }
      const ratio = Math.abs(dx) / widthRef.current;

      // Left swipe fork zone: 30-40%
      if (dx < 0 && ratio >= 0.3 && ratio < 0.4 && !forkedRef.current) {
        forkedRef.current = true;
        setPhaseSync("forking");
        setOffsetX(dx);
        if (forkTimerRef.current) clearTimeout(forkTimerRef.current);
        forkTimerRef.current = setTimeout(() => {
          forkedRef.current = true;
        }, 300);
        return;
      }

      if (p === "forking" || p === "dropping") {
        if (dy > 40) {
          setPhaseSync("dropping");
          setOffsetY(dy - 40);
        }
        if (ratio >= 0.4 && dy <= 40) {
          setPhaseSync("swiping");
        } else {
          return;
        }
      }

      setOffsetX(dx);
    },
    [setPhaseSync, clearLongPress],
  );

  const onPointerUp = useCallback(
    (_e: React.PointerEvent) => {
      clearLongPress();
      const p = phaseRef.current;
      if (p === "idle") return;

      if (longPressFiredRef.current) {
        resetCard();
        return;
      }

      const ratio = Math.abs(offsetX) / (widthRef.current || 1);

      // Dropping = fork reason
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

      // Left swipe > 40% = skip
      if (offsetX < 0 && ratio > 0.4) {
        reportSwipe({ strikeId: card.strikeId, direction: "left", reason: "later" });
        flyOut("left", () => onSkip(card.strikeId));
        return;
      }

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
  const showReflection = (card.skipCount ?? 0) >= 5;

  return (
    <div ref={containerRef} className="relative select-none touch-none">
      {/* Swipe background layers */}
      <div
        className={cn(
          "absolute inset-0 rounded-2xl flex items-center px-6 transition-opacity",
          isRight ? "bg-forest/15 justify-start" : "bg-surface-high justify-end",
        )}
        style={{ opacity: Math.min(ratio * 2, 1) }}
      >
        <span className="text-2xl">{isRight ? "✓" : "→"}</span>
      </div>

      {/* Fork options (during forking/dropping) */}
      {(phase === "forking" || phase === "dropping") && (
        <div className="absolute inset-x-0 bottom-0 translate-y-full pt-2 flex justify-center gap-3 z-10">
          <span className="px-3 py-1.5 rounded-full bg-surface-high text-xs text-muted-accessible">⏳等条件</span>
          <span className="px-3 py-1.5 rounded-full bg-surface-high text-xs text-muted-accessible">🚧有阻力</span>
          <span className="px-3 py-1.5 rounded-full bg-surface-high text-xs text-muted-accessible">🔄要重想</span>
        </div>
      )}

      {/* Card — Editorial Serenity style */}
      <div
        className={cn(
          "relative rounded-2xl bg-surface-lowest p-5",
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
        <div className="text-[11px] text-muted-accessible font-mono mb-1.5">{card.goalName}</div>

        {/* Action */}
        <div className="flex items-start gap-2.5">
          <span className="text-xl shrink-0 mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium text-on-surface leading-snug">{card.action}</div>
            {card.context && (
              <div className="text-sm text-muted-accessible mt-1">{card.context}</div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-accessible">
          {card.targetPerson && <span>→ {card.targetPerson}</span>}
          {card.durationEstimate && <span>⏱ {card.durationEstimate}</span>}
        </div>

        {/* Scene 4: 反复跳过反思提示 */}
        {showReflection && (
          <div className="mt-3 pt-3 border-t border-surface-high">
            <p className="text-xs text-dawn mb-2">
              这件事已经在这里好一阵子了，要聊聊吗？
            </p>
            {onReflect && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReflect(card.strikeId); }}
                className="flex items-center gap-1.5 text-xs text-deer hover:text-deer-dark transition-colors"
              >
                <MessageCircle size={12} />
                和路路聊聊
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
