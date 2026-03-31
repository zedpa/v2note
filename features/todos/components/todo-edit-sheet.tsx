"use client";

import { useState, useCallback, useRef } from "react";
import {
  Calendar, Clock, Trash2, Sparkles,
} from "lucide-react";
import { updateTodo, deleteTodo } from "@/shared/lib/api/todos";
import type { TodoDTO } from "../lib/todo-types";

interface TodoEditSheetProps {
  todo: TodoDTO | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onAskAI?: (message: string) => void;
}

const DURATION_OPTIONS = [
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1时" },
  { value: 120, label: "2时" },
] as const;

export function TodoEditSheet({ todo, open, onClose, onUpdated, onAskAI }: TodoEditSheetProps) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  // 同步数据
  const syncFromTodo = useCallback((t: TodoDTO) => {
    setText(t.text);
    if (t.scheduled_start) {
      const d = new Date(t.scheduled_start);
      setDate(d.toISOString().split("T")[0]);
      setTime(d.toTimeString().slice(0, 5));
    } else {
      setDate("");
      setTime("");
    }
    setDuration(t.estimated_minutes ?? null);
  }, []);

  // 打开时同步
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen && todo) syncFromTodo(todo);
      if (!isOpen) onClose();
    },
    [todo, syncFromTodo, onClose],
  );

  // 打开时触发同步
  if (open && todo && text === "" && !saving) {
    syncFromTodo(todo);
  }

  const handleSave = useCallback(async () => {
    if (!todo || saving) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};

      if (text !== todo.text) updates.text = text;

      if (date && time) {
        updates.scheduled_start = `${date}T${time}:00`;
        if (duration) {
          const end = new Date(updates.scheduled_start);
          end.setMinutes(end.getMinutes() + duration);
          // 使用本地时间格式，修复时区 bug
          const pad = (n: number) => String(n).padStart(2, "0");
          updates.scheduled_end = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}:00`;
        }
      } else if (date) {
        updates.scheduled_start = `${date}T09:00:00`;
      }

      if (duration) updates.estimated_minutes = duration;

      if (Object.keys(updates).length > 0) {
        await updateTodo(todo.id, updates);
      }

      onUpdated?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [todo, text, date, time, duration, saving, onUpdated, onClose]);

  const handleDelete = useCallback(async () => {
    if (!todo) return;
    await deleteTodo(todo.id);
    onUpdated?.();
    onClose();
  }, [todo, onUpdated, onClose]);

  if (!open || !todo) return null;

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div
        data-testid="todo-edit-sheet"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-card p-5 pb-safe"
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />

        {/* 标题（可编辑） */}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mb-4 w-full bg-transparent text-base font-medium text-foreground focus:outline-none"
        />

        {/* 日期 */}
        <div className="mb-3 flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            ref={dateRef}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-sm text-foreground"
          />
        </div>

        {/* 时间 */}
        <div className="mb-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <input
            ref={timeRef}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bg-transparent text-sm text-foreground"
          />
        </div>

        {/* 时长 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDuration(duration === opt.value ? null : opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                duration === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* AI action plan */}
        {todo.ai_action_plan && todo.ai_action_plan.length > 0 && (
          <div className="mb-4 rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              AI 建议步骤
            </div>
            {todo.ai_action_plan.map((step, i) => (
              <div key={i} className="py-1 text-sm text-foreground">
                {i + 1}. {step}
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-secondary py-3 text-sm font-medium text-foreground transition-opacity disabled:opacity-40"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={handleDelete}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors active:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* AI 帮忙 */}
        {todo.ai_actionable && onAskAI && (
          <button
            onClick={() => onAskAI(`帮我分解这个任务: ${todo.text}`)}
            className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm text-muted-foreground transition-colors active:text-primary"
          >
            让 AI 帮忙
          </button>
        )}
      </div>
    </>
  );
}
