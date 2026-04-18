import React from "react"
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import { ViewportHeightManager } from "@/components/layout/viewport-height-manager";
import { SyncBootstrap } from "@/components/layout/sync-bootstrap";
import { SentryInit } from "@/components/sentry-init";
import { FeedbackButton } from "@/features/feedback/feedback-button";
import "./fonts"; // @fontsource 本地字体（离线可用，无 CDN 依赖）
import "./globals.css";

export const metadata: Metadata = {
  title: "念念有路 — AI 认知伙伴",
  description: "你的每一个想法，我都帮你记住",
};

export const viewport: Viewport = {
  themeColor: "#FDF9F3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-body antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SentryInit />
          <ViewportHeightManager />
          <SyncBootstrap />
          {children}
          <FeedbackButton />
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
