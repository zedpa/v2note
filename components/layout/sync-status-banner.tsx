"use client";

/**
 * SyncStatusBanner — 全局同步状态条
 *
 * regression: fix-cold-resume-silent-loss (Phase 7 §5.2)
 *
 * 行为契约：
 *   - navigator.onLine === false → 灰色条"离线 · 已保存到本地，联网后自动同步"
 *   - 在线但 ws 连续 30 秒未能 OPEN → 黄色条"同步暂不可用 · 数据已安全保存"
 *   - 首次 mount 后前 15 秒 / resume 后前 15 秒 不显示任何条
 *   - 状态恢复后条消失（无残影）
 *   - 严禁阻塞点击（pointer-events-none on outer 也 OK，因为条内没有交互）
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getGatewayClient,
  type GatewayWsStatus,
} from "@/features/chat/lib/gateway-client";

type BannerState = "hidden" | "offline" | "ws-unavailable";

const GRACE_MS = 15_000;
const WS_UNAVAILABLE_THRESHOLD_MS = 30_000;

/** 安全读取 navigator.onLine（SSR / 老浏览器降级为 true） */
function readOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function SyncStatusBanner() {
  const [state, setState] = useState<BannerState>("hidden");

  // 启动 / resume 时间戳；grace 窗口内禁止显示 ws-unavailable 条
  const graceStartRef = useRef<number>(Date.now());
  // 最近一次 ws 转入非 open 的时间戳；用于计算 30s 阈值
  const wsDownSinceRef = useRef<number | null>(null);
  // 当前 ws 状态快照
  const wsStatusRef = useRef<GatewayWsStatus>("closed");
  // online 状态快照
  const onlineRef = useRef<boolean>(readOnline());
  // 定期评估的定时器
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 初始化 refs
    graceStartRef.current = Date.now();
    onlineRef.current = readOnline();

    let client: ReturnType<typeof getGatewayClient> | null = null;
    try {
      client = getGatewayClient();
      const initStatus = client.getStatus();
      wsStatusRef.current = initStatus;
      if (initStatus !== "open") wsDownSinceRef.current = Date.now();
    } catch {
      // gateway-client 不可用 → 按 closed 处理
      wsStatusRef.current = "closed";
      wsDownSinceRef.current = Date.now();
    }

    // 主评估函数：根据 online + ws + grace 决定显示什么
    const evaluate = () => {
      const now = Date.now();
      const inGrace = now - graceStartRef.current < GRACE_MS;

      // 1. offline 最高优先级（不受 grace 影响）
      if (!onlineRef.current) {
        setState("offline");
        return;
      }

      // 2. ws open → 隐藏
      if (wsStatusRef.current === "open") {
        wsDownSinceRef.current = null;
        setState("hidden");
        return;
      }

      // 3. 在线但 ws 不 open → 看是否达到 30s 阈值 + 已过 grace
      if (inGrace) {
        setState("hidden");
        return;
      }

      const downSince = wsDownSinceRef.current ?? now;
      if (now - downSince >= WS_UNAVAILABLE_THRESHOLD_MS) {
        setState("ws-unavailable");
      } else {
        setState("hidden");
      }
    };

    // 监听 online / offline
    const onOnline = () => {
      onlineRef.current = true;
      evaluate();
    };
    const onOffline = () => {
      onlineRef.current = false;
      evaluate();
    };

    // visibilitychange hidden → visible：重置 grace + down 计时（resume 语义）
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        graceStartRef.current = Date.now();
        // 若此刻仍不 open，重新开始计 30s 不可用窗口
        if (wsStatusRef.current !== "open") {
          wsDownSinceRef.current = Date.now();
        }
        evaluate();
      }
    };

    // ws 状态订阅
    const unsubStatus = client
      ? client.onStatusChange((s) => {
          wsStatusRef.current = s;
          if (s === "open") {
            wsDownSinceRef.current = null;
          } else if (wsDownSinceRef.current === null) {
            wsDownSinceRef.current = Date.now();
          }
          evaluate();
        })
      : () => {};

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    // 定期 tick：时间驱动（grace 过期 / 30s 阈值达成）需主动触发评估
    tickTimerRef.current = setInterval(evaluate, 1_000);

    // 立即跑一次
    evaluate();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubStatus();
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, []);

  if (state === "hidden") return null;

  const isOffline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sync-status-banner"
      data-state={state}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-4 py-1.5 text-xs text-center",
        "pointer-events-none select-none",
        isOffline
          ? "bg-muted-accessible/15 text-on-surface-muted"
          : "bg-amber-500/20 text-amber-100",
      )}
    >
      {isOffline
        ? "离线 · 已保存到本地，联网后自动同步"
        : "同步暂不可用 · 数据已安全保存"}
    </div>
  );
}
