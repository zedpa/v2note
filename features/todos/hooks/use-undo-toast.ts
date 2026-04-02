/**
 * 撤销 Toast — 操作后 3 秒内可撤销。
 * 基于 sonner toast 的 action 按钮实现。
 */

import { toast } from "sonner";

interface UndoOptions {
  /** 显示文案，如 "已完成「找张总确认报价」" */
  message: string;
  /** 撤销回调 */
  onUndo: () => void | Promise<void>;
  /** Toast 持续时间（毫秒），默认 3500 */
  duration?: number;
}

export function showUndoToast({ message, onUndo, duration = 3500 }: UndoOptions): void {
  toast(message, {
    duration,
    action: {
      label: "撤销",
      onClick: () => {
        void onUndo();
      },
    },
  });
}
