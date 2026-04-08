"use client";

import { useState, useRef, useCallback, useEffect, type RefObject } from "react";
import { hapticsImpactLight } from "@/shared/lib/haptics";
import { fabNotify } from "@/shared/lib/fab-notify";

/** 刷新超时时间（ms） */
const REFRESH_TIMEOUT = 10_000;

export interface UsePullToRefreshOptions {
  /** 刷新回调，返回 false 表示失败 */
  onRefresh: () => Promise<boolean>;
  /** 滚动容器 ref，用于检测 scrollTop */
  scrollRef: RefObject<HTMLElement | null>;
  /** 触发阈值（已阻尼后的距离），默认 64px */
  threshold?: number;
  /** 阻尼系数，默认 0.4 */
  dampingFactor?: number;
  /** 最小显示时间，默认 500ms */
  minDisplayTime?: number;
  /** 是否禁用（录音时 true） */
  disabled?: boolean;
}

export interface UsePullToRefreshReturn {
  /** 当前拉动距离（已阻尼） */
  pullDistance: number;
  /** 是否正在刷新 */
  isRefreshing: boolean;
  /** 是否超过阈值（可松手触发） */
  isReady: boolean;
}

export function usePullToRefresh(options: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const {
    onRefresh,
    scrollRef,
    threshold = 64,
    dampingFactor = 0.4,
    minDisplayTime = 500,
    disabled = false,
  } = options;

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // 用 ref 追踪最新值，避免 stale closure
  const pullDistanceRef = useRef(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const hapticFired = useRef(false);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);

  // Timer refs，用于 cleanup
  const minTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 组件卸载时清理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (minTimerRef.current) clearTimeout(minTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, []);

  const doRefresh = useCallback(async () => {
    setIsRefreshing(true);
    refreshingRef.current = true;

    const minTimer = new Promise<void>((resolve) => {
      minTimerRef.current = setTimeout(resolve, minDisplayTime);
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimerRef.current = setTimeout(
        () => reject(new Error("Refresh timeout")),
        REFRESH_TIMEOUT,
      );
    });

    try {
      const [ok] = await Promise.all([
        Promise.race([onRefresh(), timeoutPromise]),
        minTimer,
      ]);
      if (!ok) {
        fabNotify.error("刷新失败，请检查网络");
      }
    } catch {
      fabNotify.error("刷新失败，请检查网络");
    } finally {
      // 清理 timer
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (minTimerRef.current) clearTimeout(minTimerRef.current);
      // 仅在组件仍然挂载时更新 state
      if (mountedRef.current) {
        setIsRefreshing(false);
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setIsReady(false);
      }
      refreshingRef.current = false;
    }
  }, [onRefresh, minDisplayTime]);

  // 通过 useEffect 绑定 touch 事件（支持 non-passive 以允许 preventDefault）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (disabled || refreshingRef.current) return;
      if (el.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      tracking.current = true;
      hapticFired.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current || disabled || refreshingRef.current) return;

      // 滚动过程中 scrollTop 可能变化
      if (el.scrollTop > 0) {
        tracking.current = false;
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setIsReady(false);
        return;
      }

      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      // 上滑不处理
      if (dy <= 0) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setIsReady(false);
        return;
      }

      // 对角线手势让给水平手势
      if (Math.abs(dy) <= Math.abs(dx)) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setIsReady(false);
        return;
      }

      // 阻止默认滚动（避免 iOS 弹性滚动与指示器双重移动）
      e.preventDefault();

      const dampedDistance = dy * dampingFactor;
      setPullDistance(dampedDistance);
      pullDistanceRef.current = dampedDistance;

      const ready = dampedDistance >= threshold;
      setIsReady(ready);

      // 首次越过阈值时触发 haptic
      if (ready && !hapticFired.current) {
        hapticFired.current = true;
        hapticsImpactLight();
      }
    };

    const onTouchEnd = () => {
      if (!tracking.current || disabled || refreshingRef.current) return;
      tracking.current = false;

      // 读 ref 而非 state，避免 stale closure
      if (pullDistanceRef.current >= threshold) {
        doRefresh();
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setIsReady(false);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false }); // non-passive 以支持 preventDefault
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [scrollRef, disabled, dampingFactor, threshold, doRefresh]);

  return {
    pullDistance,
    isRefreshing,
    isReady,
  };
}
