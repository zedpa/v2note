"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Sparkles, ChevronDown, ChevronUp, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayTodos } from "@/features/todos/hooks/use-today-todos";
import { useTodos } from "@/features/todos/hooks/use-todos";
import { TodoDetailSheet } from "@/features/todos/components/todo-detail-sheet";
import { getDomainStyle } from "@/features/todos/lib/domain-config";
import type { TodoItem } from "@/shared/lib/types";
import { listGoals, listPendingIntents } from "@/shared/lib/api/goals";
import { useActionPanel } from "@/features/action-panel/hooks/use-action-panel";
import { NowCard } from "@/features/action-panel/components/now-card";
import { GoalIndicator } from "@/features/action-panel/components/goal-indicator";
import { reportSwipe } from "@/shared/lib/api/action-panel";

interface TodoWorkspaceViewProps {
  onOpenChat?: (initial?: string) => void;
  onReflect?: (strikeId: string) => void;
}

// 分组待办按时间：今日/转达/明天/稍后
interface TodoGroup {
  key: string;
  label: string;
  items: TodoItem[];
}

export function TodoWorkspaceView({ onOpenChat, onReflect }: TodoWorkspaceViewProps) {
  const { todos: todayTodos, loading: todayLoading, toggleTodo } = useTodayTodos();
  const { todos: allTodos, loading: allLoading } = useTodos();
  const {
    now: nowCard,
    goals: actionGoals,
    currentGoalIndex,
    switchGoal,
    refetch: refetchPanel,
  } = useActionPanel();
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingIntents, setPendingIntents] = useState<any[]>([]);
  const [confirmCollapsed, setConfirmCollapsed] = useState(false);

  // NowCard 完成/跳过后刷新
  const handleNowComplete = useCallback(
    (strikeId: string) => {
      reportSwipe({ strikeId, direction: "right" }).catch(() => {});
      refetchPanel();
      setRefreshKey((k) => k + 1);
    },
    [refetchPanel],
  );

  const handleNowSkip = useCallback(
    (strikeId: string, reason?: string) => {
      reportSwipe({ strikeId, direction: "left", reason }).catch(() => {});
      refetchPanel();
    },
    [refetchPanel],
  );

  // 加载待确认意图
  useEffect(() => {
    listPendingIntents?.()
      .then((intents) => setPendingIntents(intents || []))
      .catch(() => {});
  }, [refreshKey]);

  const loading = todayLoading || allLoading;

  // 分组逻辑
  const todayDate = new Date().toISOString().split("T")[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split("T")[0];

  const todayPending = todayTodos.filter((t) => !t.done);
  const todayDone = todayTodos.filter((t) => t.done);
  const totalToday = todayTodos.length;
  const doneCount = todayDone.length;
  const progressPct = totalToday > 0 ? Math.round((doneCount / totalToday) * 100) : 0;

  // 未来待办（非今日）
  const futureTodos = allTodos.filter((t) => {
    if (t.done) return false;
    const sched = t.scheduled_start?.split("T")[0];
    if (!sched) return false;
    return sched > todayDate;
  });

  const tomorrowTodos = futureTodos.filter(
    (t) => t.scheduled_start?.split("T")[0] === tomorrowDate,
  );

  const laterTodos = futureTodos.filter((t) => {
    const d = t.scheduled_start?.split("T")[0];
    return d && d > tomorrowDate;
  });

  // 无排期
  const unscheduledTodos = allTodos.filter(
    (t) => !t.done && !t.scheduled_start,
  );

  const handleToggle = useCallback(
    (id: string) => {
      toggleTodo(id);
      setRefreshKey((k) => k + 1);
    },
    [toggleTodo],
  );

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-surface-low animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-24 bg-surface-low min-h-[calc(100dvh-44px)]">
      {/* 待确认意图 */}
      {pendingIntents.length > 0 && (
        <section className="px-4 pt-4">
          <button
            onClick={() => setConfirmCollapsed(!confirmCollapsed)}
            className="flex items-center gap-2 mb-3"
          >
            <span className="w-2 h-2 rounded-full bg-deer" />
            <span className="text-sm font-medium text-on-surface">
              To Confirm
            </span>
            {confirmCollapsed ? (
              <ChevronDown size={14} className="text-muted-accessible" />
            ) : (
              <ChevronUp size={14} className="text-muted-accessible" />
            )}
          </button>
          {!confirmCollapsed &&
            pendingIntents.map((intent: any) => (
              <div
                key={intent.id}
                className="mb-2 p-3 rounded-xl bg-surface-lowest"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-on-surface">{intent.text}</span>
                  <button className="px-3 py-1 rounded-full text-xs font-medium text-white bg-deer hover:bg-deer-dark transition-colors">
                    确认
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}

      {/* Now Card — Tinder 式焦点卡片 */}
      {nowCard && (
        <section className="px-4 pt-4">
          <NowCard
            card={nowCard}
            onComplete={handleNowComplete}
            onSkip={handleNowSkip}
            onReflect={onReflect}
          />
          {/* 目标呼吸指示器 */}
          {actionGoals.length > 1 && (
            <GoalIndicator
              goals={actionGoals}
              selected={currentGoalIndex}
              onSelect={switchGoal}
            />
          )}
        </section>
      )}

      {/* 今日进度 */}
      <section className="px-4 pt-4 pb-2">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-serif text-2xl text-on-surface">Today</h2>
          <span className="font-serif text-2xl text-deer">{progressPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-surface-high overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(135deg, #89502C, #C8845C)",
              }}
            />
          </div>
          <span className="text-xs font-mono text-muted-accessible">
            {doneCount}/{totalToday}
          </span>
        </div>
      </section>

      {/* 今日待办 */}
      <section className="px-4 pt-2">
        {todayPending.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onToggle={() => handleToggle(todo.id)}
            onSelect={() => {
              setSelectedTodo(todo);
              setDetailOpen(true);
            }}
          />
        ))}

        {/* 已完成 */}
        {todayDone.length > 0 && (
          <div className="mt-2">
            {todayDone.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                done
                onToggle={() => handleToggle(todo.id)}
                onSelect={() => {
                  setSelectedTodo(todo);
                  setDetailOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* 明天 */}
      {tomorrowTodos.length > 0 && (
        <section className="px-4 pt-8">
          <h2 className="font-serif text-xl text-on-surface mb-3">Tomorrow</h2>
          {tomorrowTodos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={() => handleToggle(todo.id)}
              onSelect={() => {
                setSelectedTodo(todo);
                setDetailOpen(true);
              }}
            />
          ))}
        </section>
      )}

      {/* 稍后 */}
      {(laterTodos.length > 0 || unscheduledTodos.length > 0) && (
        <section className="px-4 pt-8">
          <h2 className="font-serif text-xl text-on-surface mb-3">Later</h2>
          {[...laterTodos, ...unscheduledTodos].map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={() => handleToggle(todo.id)}
              onSelect={() => {
                setSelectedTodo(todo);
                setDetailOpen(true);
              }}
            />
          ))}
        </section>
      )}

      {/* 空状态 */}
      {totalToday === 0 &&
        tomorrowTodos.length === 0 &&
        laterTodos.length === 0 &&
        unscheduledTodos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="font-serif text-2xl text-muted-accessible">
              今日清单已清空
            </p>
            <p className="text-sm text-muted-accessible mt-2">
              对路路说点什么，待办会自动出现
            </p>
          </div>
        )}

      {/* 待办详情 Sheet */}
      <TodoDetailSheet
        todo={selectedTodo}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onUpdated={() => setRefreshKey((k) => k + 1)}
        onAskAI={onOpenChat ? (msg) => onOpenChat(msg) : undefined}
      />
    </div>
  );
}

/* ── 待办行组件 ── */

function TodoRow({
  todo,
  done,
  onToggle,
  onSelect,
}: {
  todo: TodoItem;
  done?: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const isDone = done || todo.done;
  const timeStr = todo.scheduled_start
    ? new Date(todo.scheduled_start).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // 项目/目标标签
  const goalLabel = (todo as any).goal_title || null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 min-h-[44px] rounded-lg transition-colors",
        isDone ? "bg-surface-high" : "bg-transparent",
      )}
      style={{ marginBottom: "0.5rem" }}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="w-11 h-11 flex items-center justify-center shrink-0"
        aria-label={isDone ? "取消完成" : "标记完成"}
      >
        {isDone ? (
          <div className="w-5 h-5 rounded-full flex items-center justify-center bg-deer/20">
            <Check size={12} className="text-deer" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-muted-accessible/40" />
        )}
      </button>

      {/* 文字区 */}
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <p
          className={cn(
            "text-sm leading-snug",
            isDone
              ? "line-through text-muted-accessible"
              : "text-on-surface",
          )}
        >
          {todo.text}
        </p>
        {goalLabel && (
          <p className="text-xs text-muted-accessible mt-0.5">
            › {goalLabel}
          </p>
        )}
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-1.5 shrink-0 pr-1">
        {todo.ai_actionable && !isDone && (
          <Sparkles size={14} className="text-deer" />
        )}
        {timeStr && !isDone && (
          <span className="text-xs font-mono text-muted-accessible">
            {timeStr}
          </span>
        )}
      </div>
    </div>
  );
}
