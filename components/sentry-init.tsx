"use client";

import { useEffect } from "react";

/** 前端 Sentry 初始化组件（客户端 only） */
export function SentryInit() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@/shared/lib/sentry-browser").then(({ initBrowserSentry }) => {
        initBrowserSentry();
      });
    }
  }, []);

  return null;
}
