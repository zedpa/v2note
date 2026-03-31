"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Calendar, Clock } from "lucide-react";
import { TIME_SLOTS, getDefaultHourForSlot, localTzOffset, type TimeSlot } from "../lib/time-slots";

interface TodoCreateSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (params: {
    text: string;
    scheduled_start?: string;
    estimated_minutes?: number;
    domain?: string;
    parent_id?: string;
  }) => Promise<any>;
  /** 预填日期 YYYY-MM-DD */
  defaultDate?: string;
  /** 预填时段 */
  defaultSlot?: TimeSlot;
  /** 预填父项目 ID */
  defaultParentId?: string;
}

export function TodoCreateSheet({
  open,
  onClose,
  onCreate,
  defaultDate,
  defaultSlot,
  defaultParentId,
}: TodoCreateSheetProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦
  useEffect(() => {
    if (open) {
      setText("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      // 构建 scheduled_start（附带本地时区偏移，避免被当作 UTC）
      let scheduledStart: string | undefined;
      if (defaultDate && defaultSlot) {
        const hour = getDefaultHourForSlot(defaultSlot);
        if (hour !== null) {
          scheduledStart = `${defaultDate}T${String(hour).padStart(2, "0")}:00:00${localTzOffset()}`;
        }
      }

      await onCreate({
        text: trimmed,
        scheduled_start: scheduledStart,
        parent_id: defaultParentId,
      });

      setText("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, defaultDate, defaultSlot, defaultParentId, onCreate, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        data-testid="todo-create-sheet"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card p-5 pb-safe"
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />

        {/* 输入框 */}
        <input
          ref={inputRef}
          data-testid="todo-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="输入待办内容..."
          className="mb-4 w-full rounded-lg border border-border bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        />

        {/* 快捷信息行 */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {defaultDate && (
            <span className="flex items-center gap-1 rounded-full bg-tag-anytime px-2.5 py-1">
              <Calendar className="h-3 w-3" />
              {defaultDate}
            </span>
          )}
          {defaultSlot && defaultSlot !== "anytime" && (
            <span className="flex items-center gap-1 rounded-full bg-tag-anytime px-2.5 py-1">
              <Clock className="h-3 w-3" />
              {TIME_SLOTS.find((s) => s.key === defaultSlot)?.label}
            </span>
          )}
        </div>

        {/* 提交按钮 */}
        <button
          data-testid="todo-submit"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="w-full rounded-xl bg-secondary py-3 text-sm font-medium text-foreground transition-opacity disabled:opacity-40"
        >
          {submitting ? "添加中..." : "添加"}
        </button>
      </div>
    </>
  );
}
