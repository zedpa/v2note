"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, Clock, FolderOpen } from "lucide-react";
import { getDefaultHourForSlot, localTzOffset, type TimeSlot } from "../lib/time-slots";
import { REMINDER_OPTIONS, REMINDER_TYPE_OPTIONS, type ReminderTypeOption } from "../lib/reminder-options";
import { dispatchIntents, type ReminderType } from "@/shared/lib/intent-dispatch";
import SystemIntent from "@/shared/lib/system-intent";
import { PrioritySelector } from "./priority-selector";
import type { TodoDTO } from "../lib/todo-types";

const DURATION_OPTIONS = [
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1小时" },
  { value: 120, label: "2小时" },
] as const;

interface TodoCreateSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (params: {
    text: string;
    scheduled_start?: string;
    estimated_minutes?: number;
    priority?: number;
    domain?: string;
    parent_id?: string;
    reminder_before?: number | null;
    reminder_types?: string[] | null;
  }) => Promise<any>;
  defaultDate?: string;
  defaultSlot?: TimeSlot;
  defaultParentId?: string;
  projects?: TodoDTO[];
}

export function TodoCreateSheet({
  open,
  onClose,
  onCreate,
  defaultDate,
  defaultSlot,
  defaultParentId,
  projects,
}: TodoCreateSheetProps) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState(3);
  const [duration, setDuration] = useState<number | null>(null);
  const [reminderBefore, setReminderBefore] = useState<number | null>(null);
  const [reminderTypes, setReminderTypes] = useState<ReminderTypeOption[]>(["notification"]);
  const [parentId, setParentId] = useState<string | undefined>(defaultParentId);
  const [showProjects, setShowProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setPriority(3);
      setDuration(null);
      setReminderBefore(null);
      setReminderTypes(["notification"]);
      setParentId(defaultParentId);
      setShowProjects(false);
      // 从预设值初始化日期/时间
      setDate(defaultDate ?? "");
      if (defaultDate && defaultSlot) {
        const hour = getDefaultHourForSlot(defaultSlot);
        if (hour !== null) {
          setTime(`${String(hour).padStart(2, "0")}:00`);
        } else {
          setTime("");
        }
      } else {
        setTime("");
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, defaultParentId, defaultDate, defaultSlot]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      let scheduledStart: string | undefined;
      if (date) {
        const tz = localTzOffset();
        const t = time || "00:00"; // 无时间时用 00:00 哨兵，assignTimeSlot 识别为 anytime
        scheduledStart = `${date}T${t}:00${tz}`;
      }

      await onCreate({
        text: trimmed,
        scheduled_start: scheduledStart,
        estimated_minutes: duration ?? undefined,
        priority: priority !== 3 ? priority : undefined,
        parent_id: parentId,
        reminder_before: reminderBefore,
        reminder_types: reminderBefore != null ? reminderTypes : null,
      });

      // 保存成功后，触发日历/闹钟 Intent
      const finalTypes = reminderBefore != null ? reminderTypes : [];
      if (
        scheduledStart &&
        (finalTypes.includes("calendar") || finalTypes.includes("alarm"))
      ) {
        try {
          await dispatchIntents(
            {
              text: trimmed,
              scheduled_start: scheduledStart,
              estimated_minutes: duration ?? null,
              reminder_before: reminderBefore,
            },
            finalTypes as ReminderType[],
            SystemIntent,
          );
        } catch {
          // Intent 失败不影响创建结果
        }
      }

      setText("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, date, time, parentId, priority, duration, reminderBefore, reminderTypes, onCreate, onClose]);

  if (!open) return null;

  const selectedProject = projects?.find((p) => p.id === parentId);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div
        data-testid="todo-create-sheet"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[24px] bg-[hsl(var(--card))] px-5 pb-safe pt-3"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.5)", bottom: "var(--kb-offset, 0px)", transition: "bottom 150ms ease-out" }}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/20" />

        {/* 标题输入 — 大号加粗 */}
        <input
          ref={inputRef}
          data-testid="todo-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="准备做什么？"
          className="mb-6 w-full bg-transparent text-[22px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />

        {/* 日程 — 日期和时间并排 */}
        <div className="mb-6 flex gap-3">
          {/* 日期卡片 */}
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
          {/* 时间卡片 */}
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
          {/* Hidden native inputs */}
          <input ref={dateRef} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sr-only" tabIndex={-1} />
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

        {/* 项目选择 */}
        {projects && projects.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowProjects(!showProjects)}
              className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-4 py-3 text-sm"
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className={selectedProject ? "text-foreground" : "text-muted-foreground/50"}>
                {selectedProject ? selectedProject.text : "选择项目"}
              </span>
            </button>
            {showProjects && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => { setParentId(undefined); setShowProjects(false); }}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                    !parentId ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  无
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setParentId(p.id); setShowProjects(false); }}
                    className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                      parentId === p.id ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {p.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="mt-2 pb-2">
          <button
            data-testid="todo-submit"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="w-full rounded-xl bg-foreground py-3.5 text-[15px] font-semibold text-background transition-opacity active:opacity-80 disabled:opacity-30"
          >
            {submitting ? "添加中..." : "添加任务"}
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
