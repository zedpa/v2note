"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseShakeOptions {
  threshold?: number;
  onShake: () => void;
  enabled?: boolean;
}

export function useShake({ threshold = 15, onShake, enabled = true }: UseShakeOptions) {
  const lastAccRef = useRef({ x: 0, y: 0, z: 0 });
  const lastShakeRef = useRef(0);
  const cooldown = 2000; // ms between shakes

  const handleMotion = useCallback(
    (event: DeviceMotionEvent) => {
      if (!enabled) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const last = lastAccRef.current;
      const deltaX = Math.abs(acc.x - last.x);
      const deltaY = Math.abs(acc.y - last.y);
      const deltaZ = Math.abs(acc.z - last.z);

      lastAccRef.current = { x: acc.x, y: acc.y, z: acc.z };

      if (
        (deltaX > threshold || deltaY > threshold || deltaZ > threshold) &&
        Date.now() - lastShakeRef.current > cooldown
      ) {
        lastShakeRef.current = Date.now();
        onShake();
      }
    },
    [enabled, threshold, onShake],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [enabled, handleMotion]);
}
