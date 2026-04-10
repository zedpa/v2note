/**
 * Motion Design Tokens — 全局动画节奏统一
 *
 * 所有动画参数必须引用这些 token，禁止散写魔数。
 * 来源：spec 120 Section 0 + UI/UX Pro Max motion-consistency 规则
 */

export const motion = {
  /** 时长 token (秒) */
  duration: {
    /** 80ms — 按压反馈、状态切换 */
    instant: 0.08,
    /** 150ms — Tab crossfade、微交互、overlay 退出 */
    fast: 0.15,
    /** 250ms — Overlay 进入、Sheet 弹出 */
    normal: 0.25,
    /** 400ms — stagger 总时长上限、复杂转场 */
    slow: 0.4,
  },

  /** Spring 配置 token */
  spring: {
    /** Overlay 进入 — 快速响应 */
    snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
    /** Sheet、stagger item — 柔和自然 */
    gentle: { type: "spring" as const, stiffness: 300, damping: 24 },
    /** 完成动画等强调效果 — 有弹性 */
    bouncy: { type: "spring" as const, stiffness: 500, damping: 25 },
  },

  /** Easing token */
  ease: {
    /** 进入：快开始慢结束 */
    enter: "easeOut" as const,
    /** 退出：慢开始快结束 */
    exit: "easeIn" as const,
    /** 移动：Apple HIG fluid curve */
    move: [0.32, 0.72, 0, 1] as const,
  },
} as const;

/** framer-motion 的 Transition 类型便捷导出 */
export type MotionSpring = (typeof motion.spring)[keyof typeof motion.spring];
export type MotionEase = (typeof motion.ease)[keyof typeof motion.ease];
