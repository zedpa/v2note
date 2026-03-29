/**
 * 路路（小鹿）的 10 种情绪/状态定义
 *
 * 对应 Rive 状态机中的 State Machine Input 名称
 * 设计时请在 Rive Editor 中创建同名的 Boolean Input
 */

export const LULU_STATES = {
  /** 吃草 — 默认静息态 */
  idle: "idle",
  /** 整理笔记 — 消化/回顾进行中 */
  notes: "notes",
  /** 晒太阳 — 任务完成、一切顺利 */
  happy: "happy",
  /** 喝饮料 — AI 正在处理/酝酿 */
  drinking: "drinking",
  /** 发呆 — 长时间无操作 */
  spacing: "spacing",
  /** 生气 — 出错/网络中断 */
  angry: "angry",
  /** 心疼 — 用户情绪低落/深夜使用 */
  caring: "caring",
  /** 说话 — AI 正在回复 */
  speaking: "speaking",
  /** 思考 — 深度分析中 */
  thinking: "thinking",
  /** 跑来跑去 — 活跃操作/快速录入 */
  running: "running",
} as const;

export type LuluState = (typeof LULU_STATES)[keyof typeof LULU_STATES];

/** 状态元数据，用于无障碍标签和调试 */
export const LULU_STATE_META: Record<
  LuluState,
  { label: string; a11y: string }
> = {
  idle: { label: "吃草", a11y: "路路正在悠闲地吃草" },
  notes: { label: "整理笔记", a11y: "路路正在整理笔记" },
  happy: { label: "晒太阳", a11y: "路路在开心地晒太阳" },
  drinking: { label: "喝饮料", a11y: "路路正在喝饮料，请稍等" },
  spacing: { label: "发呆", a11y: "路路在发呆" },
  angry: { label: "生气", a11y: "路路有点生气" },
  caring: { label: "心疼", a11y: "路路在关心你" },
  speaking: { label: "说话", a11y: "路路正在说话" },
  thinking: { label: "思考", a11y: "路���正在思考" },
  running: { label: "跑来跑去", a11y: "路路在跑来跑去" },
};

/** Rive 文件路径（放在 public 下） */
export const LULU_RIV_PATH = "/lulu-mascot.riv";

/** Rive 状态机名称 */
export const LULU_STATE_MACHINE = "LuluStateMachine";

/** Rive Artboard 名称 */
export const LULU_ARTBOARD = "Lulu";
