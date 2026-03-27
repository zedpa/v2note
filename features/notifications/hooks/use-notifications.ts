"use client";

import { useState, useEffect, useCallback } from "react";

export interface AppNotification {
  id: string;
  type:
    | "morning_briefing"
    | "todo_nudge"
    | "evening_summary"
    | "relay_reminder"
    | "cognitive_alert";
  title: string;
  body: string;
  read: boolean;
  timestamp: string;
}

const STORAGE_KEY = "v2note:notifications";

function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotifications(items: AppNotification[]) {
  // 只保留最近 100 条
  const trimmed = items.slice(0, 100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    setNotifications(loadNotifications());

    // 监听 gateway 推送的通知事件
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type: AppNotification["type"];
        title: string;
        body: string;
      } | undefined;
      if (!detail) return;

      const item: AppNotification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: detail.type,
        title: detail.title,
        body: detail.body,
        read: false,
        timestamp: new Date().toISOString(),
      };

      setNotifications((prev) => {
        const next = [item, ...prev];
        saveNotifications(next);
        return next;
      });
    };

    window.addEventListener("v2note:notification", handler);
    return () => window.removeEventListener("v2note:notification", handler);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      saveNotifications(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead };
}
