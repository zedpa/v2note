"use client";

import { motion, useReducedMotion } from "framer-motion";
import { motion as tokens } from "@/shared/lib/motion-tokens";
import type { ReactNode } from "react";

/**
 * OverlayTransition — 通用 overlay 动画包裹器
 *
 * 配合 AnimatePresence 使用，提供统一的 slide-in / fade-out 转场：
 * - 进入：从右侧滑入（spring snappy, ~250ms）
 * - 退出：快速淡出（100ms）— 避免与 SwipeBack 的 slide-out 手势动画冲突
 *   SwipeBack 处理用户手势驱动的 slide-out，OverlayTransition 只做 DOM 清理级退出
 * - 尊重 prefers-reduced-motion（spec 120 场景 4.4）
 *
 * 使用方式：在 page.tsx 的 AnimatePresence 中包裹 overlay 组件。
 */
interface OverlayTransitionProps {
  children: ReactNode;
  /** framer-motion key，用于 AnimatePresence 识别 */
  motionKey: string;
  /** 自定义 className，默认 fixed inset-0 z-50 */
  className?: string;
}

export function OverlayTransition({
  children,
  motionKey,
  className = "fixed inset-0 z-50",
}: OverlayTransitionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      key={motionKey}
      className={className}
      initial={shouldReduceMotion ? false : { x: "100%" }}
      animate={{
        x: 0,
        transition: shouldReduceMotion
          ? { duration: 0 }
          : tokens.spring.snappy,
      }}
      exit={{
        // 快速 fade 而非 slide — SwipeBack 已处理手势关闭的视觉动画，
        // 按钮关闭时也用 fade，避免与内部 SwipeBack 的 fixed 定位冲突
        opacity: 0,
        transition: { duration: shouldReduceMotion ? 0 : 0.1 },
      }}
    >
      {children}
    </motion.div>
  );
}
