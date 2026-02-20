"use client";

import { useState, useCallback } from "react";

export function useLocation() {
  const [location, setLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getLocation = useCallback(async (): Promise<string | null> => {
    // Try Capacitor Geolocation first, fall back to browser API
    try {
      setLoading(true);

      // Try @capacitor/geolocation if available
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const pos = await Geolocation.getCurrentPosition({ timeout: 5000 });
        const text = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        setLocation(text);
        return text;
      } catch {
        // Fall back to browser geolocation
      }

      // Browser fallback
      if ("geolocation" in navigator) {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const text = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
              setLocation(text);
              resolve(text);
            },
            () => {
              setLocation(null);
              resolve(null);
            },
            { timeout: 5000 },
          );
        });
      }

      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, loading, getLocation };
}
