"use client";

import { useState, useEffect } from "react";
import { getPlatform } from "@/shared/lib/platform";

/** 原生壳或非标准协议下 navigator.onLine 不可靠 */
function isEmbeddedWebView(): boolean {
  if (typeof window === "undefined") return false;
  // 鸿蒙 JSBridge 已注入
  if ((window as any).__harmony_bridge__) return true;
  // file:// / resource:// 等非 http(s) 协议
  const proto = window.location.protocol;
  if (proto !== "http:" && proto !== "https:") return true;
  return false;
}

export function useNetwork() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // 原生壳 WebView 中 navigator.onLine 不可靠，直接认为在线
    if (isEmbeddedWebView()) {
      setOnline(true);
      return;
    }

    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online };
}
