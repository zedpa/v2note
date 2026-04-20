/**
 * 提醒选项常量 — 共享给 todo-edit-sheet 和 todo-create-sheet
 */

export const REMINDER_OPTIONS = [
  { value: null, label: "不提醒" },
  { value: 5, label: "5分钟前" },
  { value: 15, label: "15分钟前" },
  { value: 30, label: "30分钟前" },
  { value: 60, label: "1小时前" },
] as const;

export type ReminderTypeOption = "notification" | "alarm" | "calendar";

export const REMINDER_TYPE_OPTIONS: {
  value: ReminderTypeOption;
  label: string;
  icon: string;
}[] = [
  { value: "notification", label: "通知", icon: "📱" },
  { value: "alarm", label: "闹钟", icon: "⏰" },
  { value: "calendar", label: "日历", icon: "📅" },
];
