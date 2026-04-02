"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * 监听 visualViewport 变化，返回键盘偏移量和可视区域高度。
 * 用于移动端键盘弹出时调整底部 fixed 元素和容器高度。
 *
 * - offset: 键盘占据的像素高度（键盘收起时为 0）
 * - viewportHeight: 当前可视区域高度（含键盘弹出的缩小）
 * - isKeyboardOpen: 键盘是否打开
 */
export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<string>("100dvh");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const update = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const newOffset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
    setOffset(newOffset);
    setViewportHeight(`${vv.height}px`);
    setIsKeyboardOpen(newOffset > 50);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [update]);

  return { offset, viewportHeight, isKeyboardOpen };
}
