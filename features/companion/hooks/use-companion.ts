"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchCompanionStatus, type CompanionStatus, type DeerState, type Mood } from "@/shared/lib/api/companion";
import {
  getGatewayClient,
  type GatewayResponse,
} from "@/features/chat/lib/gateway-client";

const DEFAULT_STATUS: CompanionStatus = {
  deerState: "eating",
  statusText: "",
  mood: "calm",
  moodText: "平静",
  pendingMessage: null,
};

/** 30s 轮询间隔 */
const POLL_INTERVAL = 30_000;

export type WindowMode = "silent" | "bubble" | "dialog";

export function useCompanion() {
  const [status, setStatus] = useState<CompanionStatus>(DEFAULT_STATUS);
  const [windowMode, setWindowMode] = useState<WindowMode>("silent");
  const [loading, setLoading] = useState(true);
  const autoHideTimerRef = useRef<NodeJS.Timeout>(undefined);

  // 从 status 推导 window mode
  const updateMode = useCallback((s: CompanionStatus) => {
    if (s.pendingMessage) {
      setWindowMode("bubble");
      // 自动降级定时器
      if (s.pendingMessage.autoHide && s.pendingMessage.autoHideMs > 0) {
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = setTimeout(() => {
          setWindowMode("silent");
          setStatus((prev) => ({ ...prev, pendingMessage: null }));
        }, s.pendingMessage.autoHideMs);
      }
    } else {
      setWindowMode("silent");
    }
  }, []);

  // REST 轮询
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const s = await fetchCompanionStatus();
        if (cancelled) return;
        setStatus(s);
        updateMode(s);
      } catch {
        // 静默失败，保持当前状态
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [updateMode]);

  // WS 推送监听
  useEffect(() => {
    const client = getGatewayClient();
    const unsub = client.onMessage((msg: GatewayResponse) => {
      if (msg.type === "companion.state") {
        const s = msg.payload as unknown as CompanionStatus;
        setStatus(s);
        updateMode(s);
      }
      if (msg.type === "companion.mood") {
        setStatus((prev) => ({
          ...prev,
          mood: msg.payload.mood as Mood,
          moodText: msg.payload.moodText,
        }));
      }
    });
    return unsub;
  }, [updateMode]);

  const dismissMessage = useCallback(() => {
    setWindowMode("silent");
    setStatus((prev) => ({ ...prev, pendingMessage: null }));
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
  }, []);

  return {
    deerState: status.deerState,
    statusText: status.statusText,
    mood: status.mood,
    moodText: status.moodText,
    pendingMessage: status.pendingMessage,
    windowMode,
    loading,
    dismissMessage,
  };
}
