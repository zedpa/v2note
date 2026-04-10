"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Sparkles, ChevronDown, ChevronUp, ChevronRight, Phone, Mail, Target, TreePine, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodayTodos } from "@/features/todos/hooks/use-today-todos";
import { useTodos } from "@/features/todos/hooks/use-todos";
import { TodoDetailSheet } from "@/features/todos/components/todo-detail-sheet";
import { getDomainStyle } from "@/features/todos/lib/domain-config";
import type { TodoItem } from "@/shared/lib/types";
import { getLocalToday, toLocalDateStr, toLocalDate } from "@/features/todos/lib/date-utils";
import { listGoals, listPendingIntents } from "@/shared/lib/api/goals";
import { useActionPanel } from "@/features/action-panel/hooks/use-action-panel";
import { NowCard } from "@/features/action-panel/components/now-card";
import { GoalIndicator } from "@/features/action-panel/components/goal-indicator";
import { reportSwipe } from "@/shared/lib/api/action-panel";

interface TodoWorkspaceViewProps {
  onOpenChat?: (initial?: string) => void;
  onReflect?: (strikeId: string) => void;
  wikiPageFilter?: string | null;
}

/** 按目标/wiki page 分组 */
interface GoalGroup {
  type: "goal" | "domain" | "ungrouped";
  id: string;
  title: string;
  subtitle?: string;
  icon: "tree-pine" | "target" | "package" | "circle";
  clusterId?: string;
  todos: TodoItem[];
  doneCount: number;
  totalCount: number;
}

/** 将 todo 列表按 parent_id（目标）分组，无 parent 的按 domain 兜底 */
function groupTodosByGoal(todos: TodoItem[], goals: Array<{ id: string; text?: string; title?: string; wiki_page_id?: string; wiki_page_title?: string }>): GoalGroup[] {
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  const groups = new Map<string, GoalGroup>();

  for (const todo of todos) {
    const parentId = todo.parent_id;
    const goal = parentId ? goalMap.get(parentId) : null;

    if (goal) {
      const key = `goal-${goal.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: "goal",
          id: goal.id,
          title: goal.text || goal.title || "未命名目标",
          subtitle: goal.wiki_page_title ?? undefined,
          icon: goal.wiki_page_id ? "tree-pine" : "target",
          clusterId: goal.wiki_page_id ?? undefined,
          todos: [],
          doneCount: 0,
          totalCount: 0,
        });
      }
      const g = groups.get(key)!;
      g.todos.push(todo);
      g.totalCount++;
      if (todo.done) g.doneCount++;
    } else {
      // 按 domain 兜底
      const domain = todo.domain || "其他";
      const key = `domain-${domain}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: domain === "其他" ? "ungrouped" : "domain",
          id: domain,
          title: domain,
          icon: domain === "其他" ? "circle" : "package",
          todos: [],
          doneCount: 0,
          totalCount: 0,
        });
      }
      const g = groups.get(key)!;
      g.todos.push(todo);
      g.totalCount++;
      if (todo.done) g.doneCount++;
    }
  }

  // 排序：goal 组在前，domain 组在后，ungrouped 最后
  const typeOrder = { goal: 0, domain: 1, ungrouped: 2 };
  return Array.from(groups.values()).sort(
    (a, b) => typeOrder[a.type] - typeOrder[b.type] || b.totalCount - a.totalCount,
  );
}

export function TodoWorkspaceView({ onOpenChat, onReflect, wikiPageFilter }: TodoWorkspaceViewProps) {
  const { todos: rawTodayTodos, loading: todayLoading, toggleTodo } = useTodayTodos();
  const { todos: rawAllTodos, loading: allLoading } = useTodos();

  // wiki page 筛选：通过 goal 的 wiki_page_id 间接过滤
  const todayTodos = useMemo(() => {
    if (!wikiPageFilter) return rawTodayTodos;
    return rawTodayTodos.filter((t) => (t as any).wiki_page_id === wikiPageFilter);
  }, [rawTodayTodos, wikiPageFilter]);

  const allTodos = useMemo(() => {
    if (!wikiPageFilter) return rawAllTodos;
    return rawAllTodos.filter((t) => (t as any).wiki_page_id === wikiPageFilter);
  }, [rawAllTodos, wikiPageFilter]);
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
  const [goals, setGoals] = useState<Array<{ id: string; text?: string; title?: string; wiki_page_id?: string; wiki_page_title?: string }>>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  // 加载待确认意图 + 目标列表
  useEffect(() => {
    listPendingIntents?.()
      .then((intents) => setPendingIntents(intents || []))
      .catch(() => {});
    listGoals()
      .then((g) => setGoals((g || []).map((x: any) => ({ id: x.id, text: x.text, title: x.title, wiki_page_id: x.wiki_page_id, wiki_page_title: x.wiki_page_title }))))
      .catch(() => {});
  }, [refreshKey]);

  const loading = todayLoading || allLoading;

  // 分组逻辑
  const todayDate = getLocalToday();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = toLocalDateStr(tomorrow);

  const todayPending = todayTodos.filter((t) => !t.done);
  const todayDone = todayTodos.filter((t) => t.done);
  const totalToday = todayTodos.length;
  const doneCount = todayDone.length;
  const progressPct = totalToday > 0 ? Math.round((doneCount / totalToday) * 100) : 0;

  // 未来待办（非今日）
  const futureTodos = allTodos.filter((t) => {
    if (t.done) return false;
    if (!t.scheduled_start) return false;
    const sched = toLocalDate(t.scheduled_start);
    return sched > todayDate;
  });

  const tomorrowTodos = futureTodos.filter(
    (t) => t.scheduled_start && toLocalDate(t.scheduled_start) === tomorrowDate,
  );

  const laterTodos = futureTodos.filter((t) => {
    if (!t.scheduled_start) return false;
    const d = toLocalDate(t.scheduled_start);
    return d > tomorrowDate;
  });

  // 无排期（排除已在 todayTodos 中的）
  const todayIds = new Set(todayTodos.map((t) => t.id));
  const unscheduledTodos = allTodos.filter(
    (t) => !t.done && !t.scheduled_start && !todayIds.has(t.id),
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

      {/* 今日待办 — 按目标分组（>5 条时分组，≤5 条平铺） */}
      <section className="px-4 pt-2">
        {todayTodos.length > 5 ? (
          <TodayGrouped
            todos={todayTodos}
            goals={goals}
            collapsedGroups={collapsedGroups}
            onToggleCollapse={(key) =>
              setCollapsedGroups((prev) => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              })
            }
            onToggleTodo={handleToggle}
            onSelectTodo={(todo) => {
              setSelectedTodo(todo);
              setDetailOpen(true);
            }}
          />
        ) : (
          <>
            {todayPending.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={() => handleToggle(todo.id)}
                onSelect={() => { setSelectedTodo(todo); setDetailOpen(true); }}
              />
            ))}
            {todayDone.length > 0 && (
              <div className="mt-4">
                {todayDone.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    done
                    onToggle={() => handleToggle(todo.id)}
                    onSelect={() => { setSelectedTodo(todo); setDetailOpen(true); }}
                  />
                ))}
              </div>
            )}
          </>
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

      {/* 空状态 — 区分"全部完成"和"从未创建" */}
      {totalToday === 0 &&
        tomorrowTodos.length === 0 &&
        laterTodos.length === 0 &&
        unscheduledTodos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            {doneCount > 0 ? (
              <>
                <p className="font-serif text-2xl text-muted-accessible">
                  今天的事都做完了 ✦
                </p>
                <p className="text-sm text-muted-accessible mt-2">
                  好好休息，明天继续
                </p>
              </>
            ) : (
              <>
                <p className="font-serif text-2xl text-muted-accessible">
                  还没有待办
                </p>
                <p className="text-sm text-muted-accessible mt-2">
                  长按底部麦克风说一句话，AI 帮你提取待办
                </p>
              </>
            )}
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

/* ── 今日分组渲染 ── */

function TodayGrouped({
  todos,
  goals,
  collapsedGroups,
  onToggleCollapse,
  onToggleTodo,
  onSelectTodo,
}: {
  todos: TodoItem[];
  goals: Array<{ id: string; text?: string; title?: string; wiki_page_id?: string }>;
  collapsedGroups: Set<string>;
  onToggleCollapse: (key: string) => void;
  onToggleTodo: (id: string) => void;
  onSelectTodo: (todo: TodoItem) => void;
}) {
  const groups = useMemo(() => groupTodosByGoal(todos, goals), [todos, goals]);

  const groupIcon = (icon: GoalGroup["icon"]) => {
    switch (icon) {
      case "tree-pine": return <TreePine size={16} className="text-deer" />;
      case "target": return <Target size={16} className="text-deer" />;
      case "package": return <Package size={16} className="text-muted-accessible" />;
      default: return <div className="w-4 h-4 rounded-full bg-muted-accessible/20" />;
    }
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const key = `${group.type}-${group.id}`;
        const collapsed = collapsedGroups.has(key);
        const hasPending = group.todos.some((t) => !t.done);
        // 全部完成的组默认折叠
        const isCollapsed = collapsed || (!hasPending && !collapsedGroups.has(key));

        return (
          <div key={key}>
            {/* 组标题 */}
            <button
              onClick={() => onToggleCollapse(key)}
              className="flex items-center gap-2 w-full py-2 px-1"
            >
              {groupIcon(group.icon)}
              <div className="flex-1 min-w-0 text-left">
                <span className="text-sm font-medium text-on-surface truncate block">
                  {group.title}
                </span>
                {group.subtitle && (
                  <span className="text-[10px] text-muted-accessible truncate block">
                    {group.subtitle}
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-muted-accessible">
                {group.doneCount}/{group.totalCount}
              </span>
              {isCollapsed ? (
                <ChevronRight size={14} className="text-muted-accessible" />
              ) : (
                <ChevronDown size={14} className="text-muted-accessible" />
              )}
            </button>

            {/* 组内 todo */}
            {!isCollapsed && (
              <div className="pl-2">
                {group.todos
                  .filter((t) => !t.done)
                  .map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={() => onToggleTodo(todo.id)}
                      onSelect={() => onSelectTodo(todo)}
                    />
                  ))}
                {group.todos
                  .filter((t) => t.done)
                  .map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      done
                      onToggle={() => onToggleTodo(todo.id)}
                      onSelect={() => onSelectTodo(todo)}
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}
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
      style={{ marginBottom: "1rem" }}
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
