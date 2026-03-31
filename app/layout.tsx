import React from "react"
import type { Metadata, Viewport } from "next";
import { Newsreader, Inter, Noto_Sans_SC, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

import "./globals.css";

// Editorial Serenity 字体系统
// 标题/日期: Newsreader (serif, 编辑杂志感)
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

// 正文/功能: Inter (sans, 中性叙述) + Noto Sans SC (中文回退)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600"],
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-cjk",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// 元数据: Geist Mono (归档感)
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
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
    <html lang="zh-CN" suppressHydrationWarning className={`${newsreader.variable} ${inter.variable} ${notoSansSC.variable} ${geistMono.variable}`}>
      <body className="font-body antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" offset={80} />
        </ThemeProvider>
      </body>
    </html>
  );
}
