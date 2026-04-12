"use client";

import { useEffect } from "react";
import { getPlatform } from "@/shared/lib/platform";

const handlerStack: (() => void)[] = [];
let listenerRegistered = false;

async function registerBackButtonListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  const platform = getPlatform();

  // 鸿蒙：通过 history popstate 事件模拟返回键（WebView 返回键触发 history.back()）
  if (platform === "harmony") {
    window.addEventListener("popstate", () => {
      if (handlerStack.length > 0) {
        const handler = handlerStack.pop();
        handler?.();
        // 阻止实际的 history 回退：push 一个占位 state
        window.history.pushState(null, "", window.location.href);
      }
    });
    // 初始化时 push 一个 state，确保 popstate 可触发
    window.history.pushState(null, "", window.location.href);
    return;
  }

  // Capacitor 分支（原有逻辑不变）
  if (platform === "capacitor") {
    try {
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
      // Capacitor not available
    }
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
