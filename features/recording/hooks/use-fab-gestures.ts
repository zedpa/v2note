"use client";

import { useState, useRef, useCallback } from "react";

export type FabPhase = "idle" | "pressing" | "recording" | "locked";
export type SwipeDirection = "none" | "left" | "right";

interface FabGestureResult {
  phase: FabPhase;
  swipeDirection: SwipeDirection;
  swipeProgress: number; // 0-1
  deltaX: number;
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
  onRelease: () => void;
}

const TAP_THRESHOLD = 300;
const SWIPE_THRESHOLD = 80;

export function useFabGestures(callbacks: FabGestureCallbacks): FabGestureResult {
  const [phase, setPhase] = useState<FabPhase>("idle");
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>("none");
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [deltaX, setDeltaX] = useState(0);

  const startTimeRef = useRef(0);
  const startXRef = useRef(0);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const isPressingRef = useRef(false);
  const phaseRef = useRef<FabPhase>("idle");

  const setPhaseSync = useCallback((p: FabPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current === "locked") return;
      isPressingRef.current = true;
      startTimeRef.current = Date.now();
      startXRef.current = e.clientX;
      setPhaseSync("pressing");
      setSwipeDirection("none");
      setSwipeProgress(0);
      setDeltaX(0);

      longPressRef.current = setTimeout(() => {
        if (isPressingRef.current) {
          setPhaseSync("recording");
          callbacks.onLongPressStart();
        }
      }, TAP_THRESHOLD);
    },
    [callbacks, setPhaseSync],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current !== "recording") return;
      const dx = e.clientX - startXRef.current;
      setDeltaX(dx);

      const absDx = Math.abs(dx);
      const progress = Math.min(absDx / SWIPE_THRESHOLD, 1);
      setSwipeProgress(progress);

      if (dx < -SWIPE_THRESHOLD * 0.5) {
        setSwipeDirection("left");
      } else if (dx > SWIPE_THRESHOLD * 0.5) {
        setSwipeDirection("right");
      } else {
        setSwipeDirection("none");
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
        // Tap
        setPhaseSync("idle");
        isPressingRef.current = false;
        callbacks.onTap();
        return;
      }

      if (currentPhase === "recording") {
        const dx = e.clientX - startXRef.current;

        if (dx < -SWIPE_THRESHOLD) {
          // Swipe left → cancel
          setPhaseSync("idle");
          setSwipeDirection("none");
          setSwipeProgress(0);
          setDeltaX(0);
          callbacks.onSwipeLeft();
        } else if (dx > SWIPE_THRESHOLD) {
          // Swipe right → lock
          setPhaseSync("locked");
          setSwipeDirection("none");
          setSwipeProgress(0);
          setDeltaX(0);
          callbacks.onSwipeRight();
        } else {
          // Normal release → save
          setPhaseSync("idle");
          setSwipeDirection("none");
          setSwipeProgress(0);
          setDeltaX(0);
          callbacks.onRelease();
        }
      }

      isPressingRef.current = false;
    },
    [callbacks, setPhaseSync],
  );

  // Allow external reset (e.g., after locked recording ends)
  const reset = useCallback(() => {
    setPhaseSync("idle");
    setSwipeDirection("none");
    setSwipeProgress(0);
    setDeltaX(0);
    isPressingRef.current = false;
  }, [setPhaseSync]);

  return {
    phase,
    swipeDirection,
    swipeProgress,
    deltaX,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
