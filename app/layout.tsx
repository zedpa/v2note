import React from "react"
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Editorial Serenity 字体系统 — 系统字体 fallback（避免构建时依赖 Google Fonts）
// CSS 变量在 globals.css 中通过 :root 定义

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
          {children}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
