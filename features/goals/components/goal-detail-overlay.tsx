"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, MoreVertical, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { listGoalTodos, getGoalHealth, getGoalTimeline, listGoals } from "@/shared/lib/api/goals";
import type { Goal } from "@/shared/lib/types";

interface GoalDetailOverlayProps {
  goalId: string;
  onClose: () => void;
  onOpenChat?: (msg?: string) => void;
}

interface GoalTodo {
  id: string;
  text: string;
  done: boolean;
}

interface HealthData {
  direction: number;
  resource: number;
  path: number;
  drive: number;
}

interface TimelineEntry {
  id: string;
  type: string;
  text: string;
  date: string;
}

export function GoalDetailOverlay({ goalId, onClose, onOpenChat }: GoalDetailOverlayProps) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [todos, setTodos] = useState<GoalTodo[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listGoals().then((gs) => setGoal(gs.find((g) => g.id === goalId) || null)),
      listGoalTodos(goalId).then(setTodos).catch(() => {}),
      getGoalHealth(goalId).then(setHealth).catch(() => {}),
      getGoalTimeline(goalId).then(setTimeline).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [goalId]);

  const pendingTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const totalTodos = todos.length;
  const doneCount = doneTodos.length;
  const progressPct = totalTodos > 0 ? Math.round((doneCount / totalTodos) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-surface overflow-y-auto">
      {/* 顶部栏 */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 h-[44px] bg-surface/80 backdrop-blur-[12px]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm text-muted-accessible">Goal Detail</span>
        <button className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible">
          <MoreVertical size={18} />
        </button>
      </header>

      {loading ? (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-low animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="px-5 pb-24">
          {/* 目标名 + 进度 */}
          <section className="pt-6 pb-4">
            <h1 className="font-serif text-2xl text-on-surface leading-tight">
              {goal?.title || "目标"}
            </h1>
            <div className="flex items-baseline gap-3 mt-3">
              <span className="font-serif text-4xl text-deer">{progressPct}%</span>
              <span className="text-sm text-muted-accessible">
                {doneCount}/{totalTodos} 完成
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-high overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(135deg, #89502C, #C8845C)",
                }}
              />
            </div>
          </section>

          {/* 健康度四维 */}
          {health && (
            <section className="py-4">
              <h2 className="font-serif text-base text-on-surface mb-3">健康度</h2>
              <div className="grid grid-cols-2 gap-3">
                <HealthBar label="方向" value={health.direction} />
                <HealthBar label="资源" value={health.resource} />
                <HealthBar label="路径" value={health.path} />
                <HealthBar label="驱动" value={health.drive} />
              </div>
            </section>
          )}

          {/* 待办列表 */}
          <section className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-base text-on-surface">待办</h2>
              <button className="w-7 h-7 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface">
                <Plus size={16} />
              </button>
            </div>
            {pendingTodos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 py-2.5 min-h-[44px]">
                <div className="w-5 h-5 rounded-full border-2 border-muted-accessible/40 shrink-0" />
                <span className="text-sm text-on-surface">{todo.text}</span>
              </div>
            ))}
            {doneTodos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 py-2.5 min-h-[44px]">
                <div className="w-5 h-5 rounded-full bg-deer/20 flex items-center justify-center shrink-0">
                  <Check size={12} className="text-deer" />
                </div>
                <span className="text-sm text-muted-accessible line-through">{todo.text}</span>
              </div>
            ))}
            {todos.length === 0 && (
              <p className="text-sm text-muted-accessible py-4">暂无待办</p>
            )}
          </section>

          {/* 认知时间线 */}
          {timeline.length > 0 && (
            <section className="py-4">
              <h2 className="font-serif text-base text-on-surface mb-3">认知叙事</h2>
              <div className="space-y-3">
                {timeline.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3">
                    <TimelineIcon type={entry.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface line-clamp-2">{entry.text}</p>
                      <p className="text-xs text-muted-accessible mt-0.5 font-mono">
                        {new Date(entry.date).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 和路路聊聊 */}
          {onOpenChat && (
            <button
              onClick={() => onOpenChat(`讨论目标: ${goal?.title}`)}
              className="w-full mt-4 py-3 rounded-xl text-sm font-medium text-white text-center transition-colors"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              和路路讨论这个目标
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 健康度条 ── */
function HealthBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-accessible">{label}</span>
        <span className="text-xs font-mono text-muted-accessible">{pct}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-high overflow-hidden">
        <div
          className="h-full rounded-full bg-deer transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── 时间线图标 ── */
function TimelineIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    origin: "bg-forest",
    turning: "bg-dawn",
    conflict: "bg-maple",
    suspense: "bg-surface-high",
  };
  const filled = type !== "suspense";
  return (
    <div className="flex flex-col items-center pt-1.5">
      <div
        className={cn(
          "w-2.5 h-2.5 rounded-full shrink-0",
          filled ? (colors[type] || "bg-deer") : "border-2 border-muted-accessible/40",
        )}
      />
      <div className="w-px h-full bg-surface-high mt-1" />
    </div>
  );
}
