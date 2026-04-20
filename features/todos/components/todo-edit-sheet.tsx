"use client";

import { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Calendar, Clock, Trash2, Sparkles,
} from "lucide-react";
import { updateTodo, deleteTodo } from "@/shared/lib/api/todos";
import { dispatchIntents, type ReminderType } from "@/shared/lib/intent-dispatch";
import SystemIntent from "@/shared/lib/system-intent";
import type { TodoDTO } from "../lib/todo-types";
import { localTzOffset } from "../lib/time-slots";
import { parseScheduledTime } from "../lib/date-utils";
import { REMINDER_TYPE_OPTIONS, type ReminderTypeOption } from "../lib/reminder-options";
import { PrioritySelector } from "./priority-selector";

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
  { value: 60, label: "1小时" },
  { value: 120, label: "2小时" },
] as const;

import { REMINDER_OPTIONS } from "../lib/reminder-options";


export function TodoEditSheet({ todo, open, onClose, onUpdated, onAskAI }: TodoEditSheetProps) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [priority, setPriority] = useState(3);
  const [reminderBefore, setReminderBefore] = useState<number | null>(null);
  const [reminderTypes, setReminderTypes] = useState<ReminderTypeOption[]>(["notification"]);
  const [saving, setSaving] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const syncFromTodo = useCallback((t: TodoDTO) => {
    setText(t.text);
    if (t.scheduled_start) {
      const d = parseScheduledTime(t.scheduled_start);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      // 00:00 哨兵值 = 无具体时间（anytime），编辑时显示为空
      if (d.getHours() === 0 && d.getMinutes() === 0) {
        setTime("");
      } else {
        setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    } else {
      setDate("");
      setTime("");
    }
    setDuration(t.estimated_minutes ?? null);
    setPriority(t.priority ?? 3);
    setReminderBefore(t.reminder_before ?? null);
    setReminderTypes(
      (t.reminder_types as ReminderTypeOption[] | null)?.length
        ? (t.reminder_types as ReminderTypeOption[])
        : ["notification"],
    );
  }, []);

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
        const tz = localTzOffset();
        updates.scheduled_start = `${date}T${time}:00${tz}`;
        if (duration) {
          const end = new Date(updates.scheduled_start);
          end.setMinutes(end.getMinutes() + duration);
          const pad = (n: number) => String(n).padStart(2, "0");
          updates.scheduled_end = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}:00${tz}`;
        }
      } else if (date) {
        updates.scheduled_start = `${date}T00:00:00${localTzOffset()}`; // 无时间 → 00:00 哨兵 = anytime
      }

      if (duration !== (todo.estimated_minutes ?? null)) {
        if (duration) updates.estimated_minutes = duration;
      }
      if (priority !== (todo.priority ?? 3)) updates.priority = priority;

      // 提醒变更
      const origReminder = todo.reminder_before ?? null;
      if (reminderBefore !== origReminder) {
        updates.reminder_before = reminderBefore; // null = 清除提醒
      }

      // 提醒类型变更
      const origTypes = (todo.reminder_types as ReminderTypeOption[] | null) ?? [];
      const typesChanged =
        reminderTypes.length !== origTypes.length ||
        reminderTypes.some((t) => !origTypes.includes(t));
      if (typesChanged && reminderBefore != null) {
        updates.reminder_types = reminderTypes;
      }

      if (Object.keys(updates).length > 0) {
        await updateTodo(todo.id, updates);
      }

      // 保存成功后，触发日历/闹钟 Intent
      const finalTypes = reminderBefore != null ? reminderTypes : [];
      const scheduledStart = updates.scheduled_start ?? todo.scheduled_start;
      if (
        scheduledStart &&
        (finalTypes.includes("calendar") || finalTypes.includes("alarm"))
      ) {
        try {
          await dispatchIntents(
            {
              text: text || todo.text,
              scheduled_start: scheduledStart,
              scheduled_end: updates.scheduled_end ?? todo.scheduled_end ?? null,
              estimated_minutes: duration ?? todo.estimated_minutes ?? null,
              reminder_before: reminderBefore,
            },
            finalTypes as ReminderType[],
            SystemIntent,
          );
        } catch {
          // Intent 失败不影响保存结果
        }
      }

      onUpdated?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [todo, text, date, time, duration, priority, reminderBefore, reminderTypes, saving, onUpdated, onClose]);

  const handleDelete = useCallback(async () => {
    if (!todo) return;
    await deleteTodo(todo.id);
    onUpdated?.();
    onClose();
  }, [todo, onUpdated, onClose]);

  if (!open || !todo) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div
        data-testid="todo-edit-sheet"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[24px] bg-[hsl(var(--card))] px-5 pb-safe pt-3"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.5)", bottom: "var(--kb-offset, 0px)", transition: "bottom 150ms ease-out" }}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/20" />

        {/* 头部：标题 + 删除 */}
        <div className="mb-6 flex items-start gap-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 bg-transparent text-[22px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <button
            onClick={handleDelete}
            className="mt-1 rounded-full p-2 text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-red-400 active:text-red-500"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* 日程 — 日期和时间并排 */}
        <div className="mb-6 flex gap-3">
          <div
            className="flex flex-1 items-center rounded-xl bg-muted/60 px-4 py-3.5 cursor-pointer"
            onClick={() => {
              try { dateRef.current?.showPicker(); } catch { dateRef.current?.focus(); }
            }}
          >
            <Calendar className="mr-2.5 h-[18px] w-[18px] text-muted-foreground" />
            <span className={`text-[15px] ${date ? "text-foreground" : "text-muted-foreground/50"}`}>
              {date ? formatDateOnly(date) : "日期"}
            </span>
          </div>
          <div
            className="flex flex-1 items-center rounded-xl bg-muted/60 px-4 py-3.5 cursor-pointer"
            onClick={() => {
              try { timeRef.current?.showPicker(); } catch { timeRef.current?.focus(); }
            }}
          >
            <Clock className="mr-2.5 h-[18px] w-[18px] text-muted-foreground" />
            <span className={`text-[15px] ${time ? "text-foreground" : "text-muted-foreground/50"}`}>
              {time ? formatTimeOnly(time) : "时间"}
            </span>
          </div>
          <input ref={dateRef} type="date" value={date} onChange={(e) => { setDate(e.target.value); if (!e.target.value) setReminderBefore(null); }} className="sr-only" tabIndex={-1} />
          <input ref={timeRef} type="time" value={time} onChange={(e) => setTime(e.target.value)} step="1800" className="sr-only" tabIndex={-1} />
        </div>

        {/* 预估时长 */}
        <div className="mb-6">
          <div className="mb-2.5 ml-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            预估时长
          </div>
          <div className="flex flex-wrap gap-2.5">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDuration(duration === opt.value ? null : opt.value)}
                className={`rounded-[20px] px-4 py-2 text-[13px] font-medium transition-all ${
                  duration === opt.value
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 提醒（仅在有日期时显示） */}
        {date && (
          <div className="mb-6">
            <div className="mb-2.5 ml-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              提醒
            </div>
            <div className="flex flex-wrap gap-2.5">
              {REMINDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value ?? "none"}
                  onClick={() => setReminderBefore(opt.value)}
                  className={`rounded-[20px] px-4 py-2 text-[13px] font-medium transition-all ${
                    reminderBefore === opt.value
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 提醒方式（仅在选择了提醒时间时显示） */}
        {date && reminderBefore != null && (
          <div className="mb-6">
            <div className="mb-2.5 ml-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              提醒方式
            </div>
            <div className="flex flex-wrap gap-2.5">
              {REMINDER_TYPE_OPTIONS.map((opt) => {
                const selected = reminderTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    data-testid={`reminder-type-${opt.value}`}
                    onClick={() => {
                      setReminderTypes((prev) =>
                        selected
                          ? prev.filter((t) => t !== opt.value)
                          : [...prev, opt.value],
                      );
                    }}
                    className={`rounded-[20px] px-4 py-2 text-[13px] font-medium transition-all ${
                      selected
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 优先级 */}
        <div className="mb-6">
          <div className="mb-2.5 ml-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            优先级
          </div>
          <PrioritySelector value={priority} onChange={setPriority} />
        </div>

        {/* AI action plan */}
        {todo.ai_action_plan && todo.ai_action_plan.length > 0 && (
          <div className="mb-6 rounded-xl bg-violet-500/[0.06] p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-violet-400/80">
              <Sparkles className="h-3.5 w-3.5" />
              AI 建议步骤
            </div>
            {todo.ai_action_plan.map((step, i) => (
              <div key={i} className="py-1 text-sm text-foreground/80">
                {i + 1}. {step}
              </div>
            ))}
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="mt-2 flex items-center gap-3 pb-2">
          {todo.ai_actionable && onAskAI && (
            <button
              onClick={() => {
                onAskAI(`帮我分解这个任务: ${todo.text}`);
                onClose();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-foreground transition-colors active:bg-muted"
              style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
            >
              <Sparkles className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold text-background transition-opacity active:opacity-80 disabled:opacity-30"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function formatDateOnly(date: string): string {
  const d = new Date(date + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";

  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${month}月${day}日 周${weekdays[d.getDay()]}`;
}

function formatTimeOnly(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "上午" : "下午";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${displayH}:${String(m).padStart(2, "0")}`;
}
