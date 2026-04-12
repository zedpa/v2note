"use client";

import { Clock, Sun, CloudSun, Moon, type LucideIcon } from "lucide-react";
import { parseScheduledTime } from "./date-utils";

// ===== 时段类型 =====

export type TimeSlot = "anytime" | "morning" | "afternoon" | "evening";

export interface TimeSlotConfig {
  key: TimeSlot;
  label: string;
  icon: LucideIcon;
  hourRange: [number, number]; // [start, end)，-1 = 特殊（无调度）
  colorVar: string;
  textColorVar: string;
  emptyHint: string;
}

// ===== 时段配置 =====

export const TIME_SLOTS: TimeSlotConfig[] = [
  {
    key: "anytime",
    label: "随时",
    icon: Clock,
    hourRange: [-1, -1],
    colorVar: "--tag-anytime",
    textColorVar: "--tag-anytime-text",
    emptyHint: "今天随时可做的事",
  },
  {
    key: "morning",
    label: "上午",
    icon: Sun,
    hourRange: [5, 12],
    colorVar: "--tag-morning",
    textColorVar: "--tag-morning-text",
    emptyHint: "上午要做什么？",
  },
  {
    key: "afternoon",
    label: "下午",
    icon: CloudSun,
    hourRange: [12, 18],
    colorVar: "--tag-afternoon",
    textColorVar: "--tag-afternoon-text",
    emptyHint: "下午的安排",
  },
  {
    key: "evening",
    label: "晚上",
    icon: Moon,
    hourRange: [18, 29], // 18:00 - 04:59(次日)
    colorVar: "--tag-evening",
    textColorVar: "--tag-evening-text",
    emptyHint: "晚上收尾",
  },
];

// ===== 时段分配 =====

/**
 * 根据 scheduled_start 将待办分配到时段
 * - 无 scheduled_start → "随时"
 * - 05:00~11:59 → "上午"
 * - 12:00~17:59 → "下午"
 * - 18:00~04:59 → "晚上"（跨日）
 */
export function assignTimeSlot(scheduledStart: string | null | undefined): TimeSlot {
  if (!scheduledStart) return "anytime";

  const hour = parseScheduledTime(scheduledStart).getHours();

  for (const slot of TIME_SLOTS) {
    if (slot.key === "anytime") continue;
    const [start, end] = slot.hourRange;
    // 普通时段
    if (end <= 24 && hour >= start && hour < end) return slot.key;
    // 跨日时段（evening: 18-29 → 18-23 || 0-4）
    if (end > 24) {
      if (hour >= start && hour < 24) return slot.key;
      if (hour < end - 24) return slot.key;
    }
  }

  return "anytime";
}

/**
 * 返回当前本地时区偏移字符串，如 "+08:00"
 * 用于构建带时区的 ISO 时间字符串，避免被数据库当作 UTC
 */
export function localTzOffset(): string {
  const m = new Date().getTimezoneOffset(); // e.g. -480 for UTC+8
  const sign = m <= 0 ? "+" : "-";
  const abs = Math.abs(m);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * 根据时段获取默认的 scheduled_start 小时
 * 用于创建待办时预填时间
 */
export function getDefaultHourForSlot(slot: TimeSlot): number | null {
  switch (slot) {
    case "anytime":
      return null;
    case "morning":
      return 9;
    case "afternoon":
      return 14;
    case "evening":
      return 19;
  }
}
