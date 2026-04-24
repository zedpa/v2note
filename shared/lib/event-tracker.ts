/**
 * 应用事件追踪（留存分析埋点）
 *
 * - app_open: 应用启动/前台恢复（同一自然日5分钟节流）
 * - onboarding_step/skip/complete: 冷启动五问流程
 * - 离线时缓存到 localStorage，恢复后批量上报
 */

import { api } from "./api";
import { getLocalToday } from "@/features/todos/lib/date-utils";

type TrackEvent = "app_open" | "onboarding_step" | "onboarding_skip" | "onboarding_complete";

interface QueuedEvent {
  event: TrackEvent;
  payload?: Record<string, unknown>;
  occurred_at: string;
}

const QUEUE_KEY = "v2note:event_queue";
const THROTTLE_KEY = "v2note:last_app_open";
const THROTTLE_MS = 5 * 60 * 1000; // 5分钟

function getQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue: QueuedEvent[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
  } catch { /* ignore */ }
}

async function flushQueue() {
  const queue = getQueue();
  if (queue.length === 0) return;
  try {
    await api.post("/api/v1/events/track-batch", { events: queue });
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // 仍然离线，保留队列
  }
}

export async function trackEvent(event: TrackEvent, payload?: Record<string, unknown>) {
  // app_open 节流：同一自然日5分钟内不重复
  if (event === "app_open") {
    const now = Date.now();
    const today = getLocalToday();
    try {
      const last = localStorage.getItem(THROTTLE_KEY);
      if (last) {
        const { date, ts } = JSON.parse(last);
        if (date === today && now - ts < THROTTLE_MS) return;
      }
      localStorage.setItem(THROTTLE_KEY, JSON.stringify({ date: today, ts: now }));
    } catch { /* ignore */ }
  }

  const entry: QueuedEvent = {
    event,
    payload,
    occurred_at: new Date().toISOString(),
  };

  try {
    await api.post("/api/v1/events/track", {
      event: entry.event,
      payload: entry.payload,
      occurred_at: entry.occurred_at,
    });
    // 成功后尝试 flush 离线队列
    flushQueue().catch(() => {});
  } catch {
    // 离线 → 缓存
    const queue = getQueue();
    queue.push(entry);
    saveQueue(queue);
  }
}

/** 应用启动时调用：上报 app_open + flush 离线队列 */
export function trackAppOpen() {
  trackEvent("app_open", { platform: typeof navigator !== "undefined" && /android/i.test(navigator.userAgent) ? "android" : "ios" }).catch(() => {});
}
