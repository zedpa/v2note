"use client";

import { cn } from "@/lib/utils";

interface BottomFixedProps {
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  withSafeArea?: boolean;
}

/**
 * 底部固定定位容器，自动跟随键盘偏移。
 * 使用 CSS 变量 var(--kb-offset) 由 ViewportHeightManager 驱动，
 * 无需手动接入 useKeyboardOffset。
 */
export function BottomFixed({
  children,
  className,
  zIndex = 40,
  withSafeArea = true,
}: BottomFixedProps) {
  return (
    <div
      className={cn(
        "fixed left-0 right-0",
        withSafeArea && "pb-safe",
        className
      )}
      style={{
        bottom: "var(--kb-offset, 0px)",
        zIndex,
        transition: "bottom 150ms ease-out",
      }}
    >
      {children}
    </div>
  );
}
