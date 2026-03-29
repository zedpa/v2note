"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { DeerState } from "@/shared/lib/api/companion";
import {
  DEER_SPRITES,
  DEER_A11Y,
  SPRITE_FRAME_SIZE,
  DEFAULT_FRAME_DURATION,
} from "../lib/deer-states";

interface PixelDeerProps {
  state: DeerState;
  size?: number;
  className?: string;
}

/**
 * 像素小鹿动画组件
 * 使用 CSS background-position 偏移驱动 sprite sheet 动画
 * 降级: sprite 加载失败时显示 emoji 🦌
 * prefers-reduced-motion: 显示静态首帧
 */
export function PixelDeer({ state, size = 32, className }: PixelDeerProps) {
  const config = DEER_SPRITES[state] || DEER_SPRITES.eating;
  const frameDuration = config.frameDuration ?? DEFAULT_FRAME_DURATION;
  const [frame, setFrame] = useState(0);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>(undefined);

  // 检测 prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // 预加载 sprite sheet
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSpriteLoaded(true);
    img.onerror = () => setSpriteLoaded(false);
    img.src = "/assets/deer-sprite.png";
  }, []);

  // 帧动画循环
  useEffect(() => {
    if (reducedMotion || !spriteLoaded) return;
    setFrame(0);
    timerRef.current = setInterval(() => {
      setFrame((f) => (f + 1) % config.frameCount);
    }, frameDuration);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, config.frameCount, frameDuration, reducedMotion, spriteLoaded]);

  const a11yLabel = DEER_A11Y[state] || "路路";
  const scale = size / SPRITE_FRAME_SIZE;

  // sprite 加载失败降级为 emoji
  if (!spriteLoaded) {
    return (
      <span
        className={className}
        role="img"
        aria-label={a11yLabel}
        style={{ fontSize: size * 0.8, lineHeight: `${size}px`, display: "inline-block", width: size, height: size, textAlign: "center" }}
      >
        🦌
      </span>
    );
  }

  const currentFrame = config.startFrame + (reducedMotion ? 0 : frame);
  const offsetX = -currentFrame * SPRITE_FRAME_SIZE * scale;

  return (
    <div
      className={className}
      role="img"
      aria-label={a11yLabel}
      style={{
        width: size,
        height: size,
        backgroundImage: "url(/assets/deer-sprite.png)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: `${offsetX}px 0`,
        backgroundSize: `auto ${size}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
