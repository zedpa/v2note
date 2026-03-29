"use client";

import { useState, useCallback, useRef } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Calendar, Clock, Sparkles, Target, ChevronDown,
  Flame, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDomainStyle } from "@/features/todos/lib/domain-config";
import { updateTodo } from "@/shared/lib/api/todos";
import type { TodoItem } from "@/shared/lib/types";

interface TodoDetailSheetProps {
  todo: TodoItem | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onAskAI?: (message: string) => void;
}

const DURATION_OPTIONS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
] as const;

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";

  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${month}月${day}日 周${weekdays[d.getDay()]}`;
}

function formatTimeDisplay(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h < 12 ? "上午" : "下午";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${displayH}:${String(m).padStart(2, "0")}`;
}

export function TodoDetailSheet({ todo, open, onClose, onUpdated, onAskAI }: TodoDetailSheetProps) {
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [customDuration, setCustomDuration] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const syncFromTodo = useCallback((t: TodoItem | null) => {
    if (!t) return;
    if (t.scheduled_start) {
      const d = new Date(t.scheduled_start);
      setDate(d.toISOString().split("T")[0]);
      setTime(d.toTimeString().slice(0, 5));
    } else {
      setDate("");
      setTime("");
    }
    const mins = t.estimated_minutes ? String(t.estimated_minutes) : "";
    if ([15, 30, 60, 120].includes(Number(mins))) {
      setDuration(mins);
      setCustomDuration("");
    } else if (mins) {
      setDuration("custom");
      setCustomDuration(mins);
    } else {
      setDuration("");
      setCustomDuration("");
    }
  }, []);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen && todo) {
      syncFromTodo(todo);
    }
    if (!isOpen) onClose();
  }, [todo, syncFromTodo, onClose]);

  const handleSave = useCallback(async () => {
    if (!todo) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const mins = duration === "custom" ? parseInt(customDuration) || 30 : parseInt(duration) || 30;
      if (date && time) {
        updates.scheduled_start = `${date}T${time}:00`;
        const end = new Date(updates.scheduled_start);
        end.setMinutes(end.getMinutes() + mins);
        updates.scheduled_end = end.toISOString();
      } else if (date) {
        updates.scheduled_start = `${date}T09:00:00`;
        updates.scheduled_end = `${date}T09:30:00`;
      } else {
        updates.scheduled_start = null;
        updates.scheduled_end = null;
      }
      if (duration || customDuration) {
        updates.estimated_minutes = mins;
      }
      await updateTodo(todo.id, updates);
      onUpdated?.();
      onClose();
    } catch (err) {
      console.error("Failed to update todo:", err);
    } finally {
      setSaving(false);
    }
  }, [todo, date, time, duration, customDuration, onUpdated, onClose]);

  if (!todo) return null;

  const { config, fgStyle } = getDomainStyle(todo.domain);
  const DomainIcon = config.icon;
  const impact = todo.impact ?? 0;
  const domainColor = fgStyle.color as string;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-[20px] max-h-[80vh] overflow-y-auto p-0",
          // Hide the default Sheet close button (absolute positioned X)
          "[&>[class*='absolute'][class*='right-4']]:hidden",
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-foreground/10" />
        </div>

        {/* Header */}
        <SheetHeader className="px-5 pb-3">
          <div className="flex items-start gap-3">
            {/* Domain icon — subtle, tinted */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: `${domainColor}12` }}
            >
              <DomainIcon className="w-[18px] h-[18px]" style={{ color: `${domainColor}90` }} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-[15px] font-semibold text-left leading-snug tracking-tight">
                {todo.text}
              </SheetTitle>
              <SheetDescription className="text-[11px] text-left mt-1 flex items-center gap-1.5">
                <span style={{ color: domainColor }}>{config.label}</span>
                {todo.done && (
                  <span className="text-emerald-500">· 已完成</span>
                )}
                {todo.goal_id && (
                  <>
                    <Target className="w-3 h-3 text-amber-500 ml-0.5" />
                    <span className="text-amber-600/80">关联目标</span>
                  </>
                )}
              </SheetDescription>
            </div>
            {/* Impact badge */}
            {impact >= 7 && (
              <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0",
                impact >= 9
                  ? "bg-gradient-to-r from-orange-500/15 to-red-500/10 text-orange-600"
                  : "bg-orange-500/8 text-orange-500/90",
              )}>
                <Flame className={cn("w-3 h-3", impact >= 9 && "animate-pulse")} />
                {impact >= 9 ? "关键" : "重要"}
              </div>
            )}
          </div>
        </SheetHeader>

        {/* Divider */}
        <div className="mx-5 h-px bg-border/60" />

        <div className="px-5 py-4 space-y-5">
          {/* Date & Time — styled overlay on native inputs */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
              <Calendar className="w-3 h-3" />
              日期时间
            </label>
            <div className="flex gap-2.5">
              {/* Date picker — hidden input, visible styled trigger */}
              <div className="relative flex-1">
                <input
                  ref={dateRef}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={() => {
                    try { dateRef.current?.showPicker(); } catch { dateRef.current?.focus(); }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer text-left",
                    date
                      ? "border-foreground/15 bg-foreground/[0.03]"
                      : "border-dashed border-foreground/10 bg-transparent",
                  )}
                >
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className={cn(
                    "text-sm flex-1",
                    date ? "text-foreground" : "text-muted-foreground/40",
                  )}>
                    {date ? formatDateDisplay(date) : "选择日期"}
                  </span>
                  {date && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setDate(""); }}
                      className="text-muted-foreground/30 hover:text-muted-foreground/60 text-xs"
                    >
                      ×
                    </span>
                  )}
                </button>
              </div>

              {/* Time picker — hidden input, visible styled trigger */}
              <div className="relative w-[120px]">
                <input
                  ref={timeRef}
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={() => {
                    try { timeRef.current?.showPicker(); } catch { timeRef.current?.focus(); }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer text-left",
                    time
                      ? "border-foreground/15 bg-foreground/[0.03]"
                      : "border-dashed border-foreground/10 bg-transparent",
                  )}
                >
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className={cn(
                    "text-sm",
                    time ? "text-foreground" : "text-muted-foreground/40",
                  )}>
                    {time ? formatTimeDisplay(time) : "时间"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Duration — pill selector */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
              <Clock className="w-3 h-3" />
              预估时长
            </label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setDuration(String(value)); setCustomDuration(""); }}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-medium transition-all",
                    duration === String(value)
                      ? "text-white shadow-sm"
                      : "bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.08]",
                  )}
                  style={
                    duration === String(value)
                      ? { backgroundColor: domainColor, opacity: 0.85 }
                      : undefined
                  }
                >
                  {label}
                </button>
              ))}
              {/* Custom duration with unit */}
              <div className={cn(
                "relative flex items-center rounded-xl transition-all",
                duration === "custom"
                  ? "ring-1 ring-foreground/15"
                  : "bg-foreground/[0.04]",
              )}>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="自定"
                  value={customDuration}
                  onFocus={() => setDuration("custom")}
                  onChange={(e) => {
                    setDuration("custom");
                    setCustomDuration(e.target.value);
                  }}
                  className="w-16 bg-transparent px-3 py-2 text-xs text-center focus:outline-none placeholder:text-muted-foreground/40"
                />
                {customDuration && (
                  <span className="text-[10px] text-muted-foreground/50 pr-2.5 -ml-1">min</span>
                )}
              </div>
            </div>
          </div>

          {/* AI action plan — sub-tasks as checkboxes */}
          {todo.ai_action_plan && todo.ai_action_plan.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-500/80 uppercase tracking-wider">
                <Zap className="w-3 h-3" />
                子任务
              </div>
              <div className="space-y-1.5 rounded-xl bg-violet-500/[0.04] border border-violet-500/10 p-3">
                {todo.ai_action_plan.map((step, i) => (
                  <label key={i} className="flex items-start gap-2.5 cursor-default">
                    <span className="shrink-0 mt-[3px] w-4 h-4 rounded border border-muted-foreground/30 flex items-center justify-center">
                      {/* Visual-only unchecked checkbox */}
                    </span>
                    <span className="text-sm text-on-surface leading-relaxed">{step}</span>
                  </label>
                ))}
              </div>
              {/* 让AI帮忙 button with deer gradient */}
              {onAskAI && (
                <button
                  type="button"
                  onClick={() => {
                    onAskAI(`帮我处理这个任务：${todo.text}`);
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
                    "bg-gradient-to-r from-dawn to-antler",
                    "hover:opacity-90 active:scale-[0.98]",
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  让AI帮忙
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1 pb-safe">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "flex-1 py-3 rounded-2xl text-sm font-semibold transition-all",
                "bg-foreground text-background",
                "hover:opacity-90 active:scale-[0.98]",
                "disabled:opacity-40",
              )}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            {todo.ai_actionable && onAskAI && (
              <button
                type="button"
                onClick={() => {
                  onAskAI(`帮我处理这个任务：${todo.text}`);
                  onClose();
                }}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-3 rounded-2xl text-sm font-semibold transition-all",
                  "bg-violet-500/10 text-violet-600",
                  "hover:bg-violet-500/15 active:scale-[0.98]",
                )}
              >
                <Sparkles className="w-4 h-4" />
                AI
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
