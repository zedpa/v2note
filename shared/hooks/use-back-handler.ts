"use client";

import { useEffect } from "react";

const handlerStack: (() => void)[] = [];
let listenerRegistered = false;

async function registerBackButtonListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      if (handlerStack.length > 0) {
        const handler = handlerStack.pop();
        handler?.();
      } else {
        App.exitApp();
      }
    });
  } catch {
    // Capacitor not available (web env)
  }
}

// Initialize listener on module load
registerBackButtonListener();

/**
 * Register a back-button handler while a condition is truthy.
 * Pass a callback to register, or null to skip.
 *
 * When the Android back gesture / back button fires,
 * the most recently pushed handler is called (stack-based).
 */
export function useBackHandler(handler: (() => void) | null) {
  useEffect(() => {
    if (!handler) return;

    handlerStack.push(handler);
    return () => {
      const idx = handlerStack.indexOf(handler);
      if (idx !== -1) handlerStack.splice(idx, 1);
    };
  }, [handler]);
}
