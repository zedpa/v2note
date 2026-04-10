/**
 * Stagger 入场动画 variants — spec 120 场景 4.3
 *
 * 列表项按序依次入场（30ms stagger），使用 spring 物理。
 * 只在首次加载时播放，滚动时不播放（参见 spec 120 场景 2.10）。
 *
 * 使用方式：
 * ```tsx
 * <motion.div variants={staggerContainer} initial="hidden" animate={isInitialLoad ? "show" : false}>
 *   {items.map(item => (
 *     <motion.div key={item.id} variants={staggerItem}>
 *       ...
 *     </motion.div>
 *   ))}
 * </motion.div>
 * ```
 */

import { motion as tokens } from "./motion-tokens";

export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.03,  // 30ms per item
      delayChildren: 0.05,    // 50ms initial delay
    },
  },
} as const;

export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: tokens.spring.gentle,
  },
} as const;

/**
 * 最大 stagger 项数 — 超过此数量后不再 stagger，避免总时长过长
 * 10 items × 30ms = 300ms，加上 50ms delay = 350ms < 400ms 上限
 */
export const MAX_STAGGER_ITEMS = 10;
