"use client";

import { useState, useRef, useCallback } from "react";

export type FabPhase = "idle" | "pressing" | "recording" | "locked";
export type SwipeDirection = "none" | "left" | "right" | "up";

interface FabGestureResult {
  phase: FabPhase;
  swipeDirection: SwipeDirection;
  swipeProgress: number; // 0-1
  deltaX: number;
  deltaY: number;
  reset: () => void;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}

interface FabGestureCallbacks {
  onTap: () => void;
  onLongPressStart: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
  onRelease: () => void;
}

const TAP_THRESHOLD = 300;
const SWIPE_THRESHOLD = 80;

export function useFabGestures(callbacks: FabGestureCallbacks): FabGestureResult {
  const [phase, setPhase] = useState<FabPhase>("idle");
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>("none");
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [deltaX, setDeltaX] = useState(0);
  const [deltaY, setDeltaY] = useState(0);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const isPressingRef = useRef(false);
  const phaseRef = useRef<FabPhase>("idle");

  const setPhaseSync = useCallback((p: FabPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const resetSwipe = useCallback(() => {
    setSwipeDirection("none");
    setSwipeProgress(0);
    setDeltaX(0);
    setDeltaY(0);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current === "locked") return;

      isPressingRef.current = true;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      setPhaseSync("pressing");
      resetSwipe();

      longPressRef.current = setTimeout(() => {
        if (isPressingRef.current) {
          setPhaseSync("recording");
          callbacks.onLongPressStart();
        }
      }, TAP_THRESHOLD);
    },
    [callbacks, resetSwipe, setPhaseSync],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current !== "recording") return;

      const dx = e.clientX - startXRef.current;
      const dy = startYRef.current - e.clientY; // up is positive
      const absDx = Math.abs(dx);
      const absDy = Math.max(0, dy);

      setDeltaX(dx);
      setDeltaY(dy);

      const verticalLead = absDy > absDx * 1.15;
      const horizontalLead = absDx > absDy * 0.85;

      if (absDy > SWIPE_THRESHOLD * 0.45 && verticalLead) {
        setSwipeDirection("up");
        setSwipeProgress(Math.min(absDy / SWIPE_THRESHOLD, 1));
      } else if (dx < -SWIPE_THRESHOLD * 0.45 && horizontalLead) {
        setSwipeDirection("left");
        setSwipeProgress(Math.min(absDx / SWIPE_THRESHOLD, 1));
      } else if (dx > SWIPE_THRESHOLD * 0.45 && horizontalLead) {
        setSwipeDirection("right");
        setSwipeProgress(Math.min(absDx / SWIPE_THRESHOLD, 1));
      } else {
        setSwipeDirection("none");
        setSwipeProgress(0);
      }
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }

      const currentPhase = phaseRef.current;

      if (currentPhase === "pressing") {
        setPhaseSync("idle");
        isPressingRef.current = false;
        callbacks.onTap();
        return;
      }

      if (currentPhase === "recording") {
        const dx = e.clientX - startXRef.current;
        const dy = startYRef.current - e.clientY;
        const absDy = Math.max(0, dy);
        const verticalLead = absDy > Math.abs(dx) * 1.15;

        if (absDy > SWIPE_THRESHOLD && verticalLead) {
          setPhaseSync("idle");
          resetSwipe();
          callbacks.onSwipeUp();
        } else if (dx < -SWIPE_THRESHOLD) {
          setPhaseSync("idle");
          resetSwipe();
          callbacks.onSwipeLeft();
        } else if (dx > SWIPE_THRESHOLD) {
          setPhaseSync("locked");
          resetSwipe();
          callbacks.onSwipeRight();
        } else {
          setPhaseSync("idle");
          resetSwipe();
          callbacks.onRelease();
        }
      }

      isPressingRef.current = false;
    },
    [callbacks, resetSwipe, setPhaseSync],
  );

  const reset = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    setPhaseSync("idle");
    resetSwipe();
    isPressingRef.current = false;
  }, [resetSwipe, setPhaseSync]);

  return {
    phase,
    swipeDirection,
    swipeProgress,
    deltaX,
    deltaY,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
