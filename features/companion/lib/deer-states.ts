import type { DeerState } from "@/shared/lib/api/companion";

/** 每个状态在 sprite sheet 中的帧范围 */
export interface SpriteConfig {
  startFrame: number;
  frameCount: number;
  /** 每帧播放时长(ms)，默认 ~167ms (6fps) */
  frameDuration?: number;
}

/** 状态 → sprite 帧映射（对应 spec 1.2） */
export const DEER_SPRITES: Record<DeerState, SpriteConfig> = {
  eating:      { startFrame: 0,  frameCount: 6 },
  organizing:  { startFrame: 6,  frameCount: 6 },
  sunbathing:  { startFrame: 12, frameCount: 4 },
  drinking:    { startFrame: 16, frameCount: 6 },
  spacing_out: { startFrame: 22, frameCount: 4 },
  angry:       { startFrame: 26, frameCount: 6 },
  worried:     { startFrame: 32, frameCount: 4 },
  speaking:    { startFrame: 36, frameCount: 6 },
  thinking:    { startFrame: 42, frameCount: 6, frameDuration: 333 }, // 3fps for deep thinking
  running:     { startFrame: 48, frameCount: 8 },
};

/** 状态 → 默认状态文字 */
export const DEER_STATUS_TEXT: Record<DeerState, string> = {
  eating:      "",
  organizing:  "在整理你的想法",
  sunbathing:  "今天效率不错",
  drinking:    "有些想法在冒泡",
  spacing_out: "...",
  angry:       "那件事又跳过了",
  worried:     "这么晚了...",
  speaking:    "",
  thinking:    "让我想想...",
  running:     "忙着呢!",
};

/** 状态 → 无障碍标签 */
export const DEER_A11Y: Record<DeerState, string> = {
  eating:      "路路在吃草",
  organizing:  "路路正在整理笔记",
  sunbathing:  "路路在晒太阳",
  drinking:    "路路在喝饮料",
  spacing_out: "路路在发呆",
  angry:       "路路有点生气",
  worried:     "路路有点担心你",
  speaking:    "路路在说话",
  thinking:    "路路在思考",
  running:     "路路在忙碌",
};

/** sprite sheet 常量 */
export const SPRITE_FRAME_SIZE = 32; // px
export const DEFAULT_FRAME_DURATION = 167; // ms (~6fps)
