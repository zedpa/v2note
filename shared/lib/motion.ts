/**
 * framer-motion 统一导出
 * 使用 lazy import 以支持 tree-shaking，避免 SSR 冲突
 */
"use client";

export {
  motion,
  AnimatePresence,
  useSpring,
  useMotionValue,
  useTransform,
  useAnimation,
  useDragControls,
} from "framer-motion";

export type { Variants, MotionProps, PanInfo } from "framer-motion";
