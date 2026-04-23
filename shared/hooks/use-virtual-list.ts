"use client";

import { useCallback, useMemo, type RefObject } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";

/**
 * 虚拟滚动 hook 配置
 *
 * 封装 @tanstack/react-virtual 的通用配置，
 * 提供 estimateSize + measureElement 动态高度测量。
 */
export interface UseVirtualListOptions {
  /** 列表总条目数 */
  count: number;
  /** 预估单条高度（px），用于初始布局计算 */
  estimateSize: number;
  /** 额外渲染的缓冲条数，默认 3 */
  overscan?: number;
  /** 滚动容器 ref */
  parentRef: RefObject<HTMLElement | null>;
  /** 是否启用虚拟滚动，默认 true；空列表时应为 false */
  enabled?: boolean;
}

export interface UseVirtualListReturn {
  /** virtualizer 实例 */
  virtualizer: Virtualizer<HTMLElement, Element>;
  /** 虚拟列表项数组（可见区域 + overscan） */
  virtualItems: ReturnType<Virtualizer<HTMLElement, Element>["getVirtualItems"]>;
  /** 内容总高度（px） */
  totalSize: number;
  /** measureElement 回调，绑定到每个 item 的 ref */
  measureElement: (node: Element | null) => void;
  /** 重新测量所有尺寸（刷新后调用） */
  remeasure: () => void;
}

/**
 * 通用虚拟滚动 hook
 *
 * 使用 @tanstack/react-virtual 实现动态高度虚拟滚动。
 * estimateSize 用于首次渲染的占位高度，measureElement 测量真实高度后缓存。
 */
export function useVirtualList(options: UseVirtualListOptions): UseVirtualListReturn {
  const {
    count,
    estimateSize,
    overscan = 3,
    parentRef,
    enabled = true,
  } = options;

  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    // 启用动态测量
    measureElement: (el) => {
      if (!el) return estimateSize;
      return el.getBoundingClientRect().height;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const measureElement = useCallback(
    (node: Element | null) => {
      if (node) {
        virtualizer.measureElement(node);
      }
    },
    [virtualizer],
  );

  const remeasure = useCallback(() => {
    virtualizer.measure();
  }, [virtualizer]);

  return {
    virtualizer,
    virtualItems,
    totalSize,
    measureElement,
    remeasure,
  };
}
