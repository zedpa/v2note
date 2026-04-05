"use client";

import { useEffect } from "react";

/**
 * 全局 Viewport 高度管理器。
 * 监听 visualViewport 变化，将可视区域高度和键盘偏移写入 CSS 变量：
 * - --app-height: 当前可视区域高度（键盘弹出时缩小）
 * - --kb-offset: 键盘占据的像素高度（键盘收起时为 0）
 *
 * 挂载在根布局中，全局单例。所有页面容器使用 h-[var(--app-height)]
 * 代替 min-h-dvh，所有底部 fixed 元素使用 var(--kb-offset) 补偿。
 */
export function ViewportHeightManager() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    if (!vv) {
      root.style.setProperty("--app-height", "100dvh");
      root.style.setProperty("--kb-offset", "0px");
      return;
    }

    const update = () => {
      const h = vv.height;
      const offset = Math.max(0, window.innerHeight - vv.offsetTop - h);
      root.style.setProperty("--app-height", `${h}px`);
      root.style.setProperty("--kb-offset", `${offset}px`);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return null;
}
