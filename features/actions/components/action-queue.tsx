"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Overlay } from "@/components/layout/overlay";
import {
  fetchActionPanel,
  reportSwipe,
  type ActionItem,
} from "@/shared/lib/api/action-panel";

interface ActionQueueProps {
  isOpen: boolean;
  onClose: () => void;
}

const SKIP_REASONS = [
  { key: "waiting", label: "⏳ 等条件" },
  { key: "blocked", label: "🚧 有阻力" },
  { key: "rethink", label: "🔄 要重想" },
] as const;

export function ActionQueue({ isOpen, onClose }: ActionQueueProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [completed, setCompleted] = useState<ActionItem[]>([]);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [reasonMenuId, setReasonMenuId] = useState<string | null>(null);

  // Swipe tracking
  const swipeRef = useRef<{
    startX: number;
    strikeId: string;
  } | null>(null);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});

  // Long-press tracking
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchActionPanel().then((panel) => {
      setItems(panel.today);
      setCompleted([]);
      setCompletedOpen(false);
    });
  }, [isOpen]);

  const handleComplete = useCallback(
    (item: ActionItem) => {
      reportSwipe({ strikeId: item.strikeId, direction: "left" });
      setItems((prev) => prev.filter((i) => i.strikeId !== item.strikeId));
      setCompleted((prev) => [...prev, item]);
    },
    []
  );

  const handleDefer = useCallback(
    (item: ActionItem) => {
      reportSwipe({ strikeId: item.strikeId, direction: "right" });
      // Move item to end of queue, bump skipCount
      setItems((prev) => {
        const rest = prev.filter((i) => i.strikeId !== item.strikeId);
        return [
          ...rest,
          { ...item, skipCount: (item.skipCount ?? 0) + 1 },
        ];
      });
      setSwipeOffsets((prev) => {
        const next = { ...prev };
        delete next[item.strikeId];
        return next;
      });
    },
    []
  );

  const handleReasonSelect = useCallback(
    (item: ActionItem, reason: string) => {
      reportSwipe({
        strikeId: item.strikeId,
        direction: "right",
        reason,
      });
      setItems((prev) => {
        const rest = prev.filter((i) => i.strikeId !== item.strikeId);
        return [
          ...rest,
          { ...item, skipCount: (item.skipCount ?? 0) + 1 },
        ];
      });
      setReasonMenuId(null);
    },
    []
  );

  // Pointer events for swipe + long-press
  const onPointerDown = (e: React.PointerEvent, item: ActionItem) => {
    swipeRef.current = { startX: e.clientX, strikeId: item.strikeId };

    // Start long-press timer
    longPressTimer.current = setTimeout(() => {
      swipeRef.current = null; // cancel swipe
      setReasonMenuId(item.strikeId);
    }, 500);
  };

  const onPointerMove = (e: React.PointerEvent, item: ActionItem) => {
    if (!swipeRef.current || swipeRef.current.strikeId !== item.strikeId)
      return;
    const dx = e.clientX - swipeRef.current.startX;
    // Only allow rightward swipe
    if (Math.abs(dx) > 8) {
      // Cancel long-press once dragging
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    if (dx > 0) {
      setSwipeOffsets((prev) => ({ ...prev, [item.strikeId]: dx }));
    }
  };

  const onPointerUp = (e: React.PointerEvent, item: ActionItem) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!swipeRef.current || swipeRef.current.strikeId !== item.strikeId) return;

    const dx = e.clientX - swipeRef.current.startX;
    swipeRef.current = null;

    if (dx > 80) {
      handleDefer(item);
    } else {
      // Snap back
      setSwipeOffsets((prev) => {
        const next = { ...prev };
        delete next[item.strikeId];
        return next;
      });
    }
  };

  const onPointerCancel = (_e: React.PointerEvent, item: ActionItem) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    swipeRef.current = null;
    setSwipeOffsets((prev) => {
      const next = { ...prev };
      delete next[item.strikeId];
      return next;
    });
  };

  return (
    <Overlay isOpen={isOpen} onClose={onClose} mode="sidebar" title="行动队列">
      <div className="space-y-1">
        {items.map((item, index) => {
          const offset = swipeOffsets[item.strikeId] ?? 0;
          const skipCount = item.skipCount ?? 0;

          return (
            <div key={item.strikeId} className="relative">
              {/* Swipe-behind label */}
              {offset > 0 && (
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-bark/50">
                  稍后再说
                </div>
              )}

              <div
                className="relative flex items-center gap-2.5 py-2 text-sm text-bark select-none touch-pan-y"
                style={{
                  transform: offset > 0 ? `translateX(${offset}px)` : undefined,
                  transition: offset > 0 ? "none" : "transform 0.2s ease",
                  background: "var(--color-cream, #faf8f5)",
                }}
                onPointerDown={(e) => onPointerDown(e, item)}
                onPointerMove={(e) => onPointerMove(e, item)}
                onPointerUp={(e) => onPointerUp(e, item)}
                onPointerCancel={(e) => onPointerCancel(e, item)}
              >
                {/* Dot — click to complete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleComplete(item);
                  }}
                  className={`mt-0.5 w-2.5 h-2.5 shrink-0 rounded-full border-0 p-0 cursor-pointer transition-colors ${
                    index === 0
                      ? "bg-sky hover:bg-sky/70"
                      : "bg-bark/30 hover:bg-bark/50"
                  }`}
                  aria-label="完成"
                />
                <div className="min-w-0 flex-1">
                  <span className="truncate block">{item.text}</span>
                  {/* Skip 5+ times warning */}
                  {skipCount >= 5 && (
                    <p className="mt-1 text-xs text-deer leading-snug">
                      这件事已经在这里一周了。要聊聊吗？
                    </p>
                  )}
                </div>
              </div>

              {/* Long-press reason menu */}
              {reasonMenuId === item.strikeId && (
                <div className="absolute right-2 top-1 z-20 bg-white rounded-lg shadow-lg border border-brand-border py-1">
                  {SKIP_REASONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => handleReasonSelect(item, r.key)}
                      className="block w-full text-left px-3 py-1.5 text-sm text-bark hover:bg-sand transition-colors"
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setReasonMenuId(null)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-bark/40 hover:bg-sand transition-colors"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="py-6 text-center text-sm text-bark/40">
            暂无待办行动
          </p>
        )}

        {/* Collapsible completed section */}
        {completed.length > 0 && (
          <div className="mt-4 pt-3 border-t border-brand-border">
            <button
              onClick={() => setCompletedOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-bark/50 hover:text-bark transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className={`transition-transform ${completedOpen ? "rotate-90" : ""}`}
              >
                <path
                  d="M4 2l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              已完成 ({completed.length})
            </button>
            {completedOpen && (
              <div className="mt-2 space-y-1">
                {completed.map((item) => (
                  <div
                    key={item.strikeId}
                    className="flex items-center gap-2.5 py-1.5 text-sm text-bark/40 line-through"
                  >
                    <span className="mt-0.5 w-2.5 h-2.5 shrink-0 rounded-full bg-bark/15" />
                    <span className="truncate">{item.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
