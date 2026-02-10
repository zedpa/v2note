"use client";

import { useRef, useCallback, type ReactNode } from "react";

interface SwipeBackProps {
  onClose: () => void;
  children: ReactNode;
}

const EDGE_THRESHOLD = 30; // px from left edge to activate
const CLOSE_THRESHOLD = 100; // px of horizontal displacement to trigger close

export function SwipeBack({ onClose, children }: SwipeBackProps) {
  const startX = useRef<number | null>(null);
  const currentX = useRef(0);
  const active = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX < EDGE_THRESHOLD) {
      startX.current = touch.clientX;
      active.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!active.current || startX.current === null) return;
    const touch = e.touches[0];
    const dx = Math.max(0, touch.clientX - startX.current);
    currentX.current = dx;

    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${dx}px)`;
      containerRef.current.style.transition = "none";
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    startX.current = null;

    if (containerRef.current) {
      if (currentX.current > CLOSE_THRESHOLD) {
        // Animate off screen then close
        containerRef.current.style.transition = "transform 0.2s ease-out";
        containerRef.current.style.transform = "translateX(100%)";
        setTimeout(onClose, 200);
      } else {
        // Snap back
        containerRef.current.style.transition = "transform 0.2s ease-out";
        containerRef.current.style.transform = "translateX(0)";
      }
    }
    currentX.current = 0;
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-background overflow-y-auto"
      style={{ willChange: "transform" }}
    >
      {children}
    </div>
  );
}
