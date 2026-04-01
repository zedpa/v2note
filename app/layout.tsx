import React from "react"
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

// Editorial Serenity 字体系统 — 全部本地加载，避免 Turbopack + Google Fonts 断网问题

// 标题/日期: Newsreader (serif, 编辑杂志感)
const newsreader = localFont({
  src: [
    { path: "../public/fonts/newsreader-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/newsreader-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/newsreader-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/newsreader-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/newsreader-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../public/fonts/newsreader-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/newsreader-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../public/fonts/newsreader-latin-600-italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
});

// 正文/功能: Inter (sans, 中性叙述)
const inter = localFont({
  src: [
    { path: "../public/fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

// 元数据: Geist Mono (归档感)
const geistMono = localFont({
  src: [
    { path: "../public/fonts/GeistMono-Regular.ttf", weight: "400" },
    { path: "../public/fonts/GeistMono-Bold.ttf", weight: "700" },
  ],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="zh-CN" suppressHydrationWarning className={`${newsreader.variable} ${inter.variable} ${geistMono.variable}`}>
      <body className="font-body antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
