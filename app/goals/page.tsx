"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchActionPanel,
  type GoalIndicator,
} from "@/shared/lib/api/action-panel";
import { getDeviceId } from "@/shared/lib/device";

/* ── Local types for three-level hierarchy ── */

interface ActionEntry {
  id: string;
  text: string;
  done: boolean;
  skipCount: number;
}

interface Goal {
  goalId: string;
  goalName: string;
  actions: ActionEntry[];
  /** 4 health dimensions, each 0–1 */
  health: { direction: number; resource: number; path: number; drive: number };
  projectId: string | null;
}

interface Project {
  id: string;
  name: string;
  dateRange: string;
  goals: Goal[];
}

/* ── Health bar labels ── */
const HEALTH_LABELS: { key: keyof Goal["health"]; label: string }[] = [
  { key: "direction", label: "方向" },
  { key: "resource", label: "资源" },
  { key: "path", label: "路径" },
  { key: "drive", label: "驱动" },
];

/* ── Narrative arc dots ── */
const NARRATIVE_DOTS: { key: string; label: string; filled: boolean }[] = [
  { key: "origin", label: "起点", filled: true },
  { key: "turn", label: "转折", filled: true },
  { key: "conflict", label: "冲突", filled: true },
  { key: "suspense", label: "悬念", filled: false },
];

/* ── Action Detail Panel (right 360px) ── */

function ActionDetailPanel({
  action,
  onClose,
}: {
  action: ActionEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed right-0 top-0 bottom-0 w-[360px] max-w-[90vw] bg-cream dark:bg-card border-l border-brand-border dark:border-border overflow-y-auto z-40 shadow-lg animate-in slide-in-from-right duration-200">
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-border bg-cream/90 dark:bg-card/90 backdrop-blur-sm">
        <h2 className="text-base font-semibold text-bark dark:text-foreground truncate">
          {action.text}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-bark/50 hover:text-bark dark:text-foreground/50 dark:hover:text-foreground hover:bg-sand dark:hover:bg-secondary transition-colors"
          aria-label="关闭"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M6 6l8 8M14 6l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Source diary */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-2">
            📖 来源日记
          </h3>
          <p className="text-sm text-bark/60 dark:text-muted-foreground">
            暂无关联日记
          </p>
        </div>

        {/* Execution history */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-2">
            📊 执行历史
          </h3>
          <div className="text-sm text-bark/60 dark:text-muted-foreground space-y-1">
            <p>跳过次数：{action.skipCount}</p>
            <p>完成状态：{action.done ? "已完成" : "未完成"}</p>
          </div>
        </div>

        {/* Dependencies */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-2">
            🔗 依赖关系
          </h3>
          <p className="text-sm text-bark/60 dark:text-muted-foreground">
            暂无依赖
          </p>
        </div>

        {/* Discuss button */}
        <button
          type="button"
          onClick={() => console.log("[counselor] 聊聊为什么这件事一直没做:", action.text)}
          className="w-full py-2.5 text-sm font-medium text-deer border border-deer rounded-lg hover:bg-deer/10 transition-colors"
        >
          💬 聊聊为什么这件事一直没做
        </button>
      </div>
    </div>
  );
}

/* ── Goal Detail Panel (right 360px) ── */

function GoalDetailPanel({
  goal,
  onClose,
}: {
  goal: Goal;
  onClose: () => void;
}) {
  return (
    <div className="fixed right-0 top-0 bottom-0 w-[360px] max-w-[90vw] bg-cream dark:bg-card border-l border-brand-border dark:border-border overflow-y-auto z-40 shadow-lg animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-border bg-cream/90 dark:bg-card/90 backdrop-blur-sm">
        <h2 className="text-base font-semibold text-bark dark:text-foreground truncate">
          {goal.goalName}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-bark/50 hover:text-bark dark:text-foreground/50 dark:hover:text-foreground hover:bg-sand dark:hover:bg-secondary transition-colors"
          aria-label="关闭"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M6 6l8 8M14 6l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* 1. Health bars */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-3">
            🩺 健康度
          </h3>
          <div className="space-y-2">
            {HEALTH_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-bark/60 dark:text-muted-foreground w-8">
                  {label}
                </span>
                <div className="flex-1 h-2 bg-brand-border dark:bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bark dark:bg-foreground rounded-full transition-all"
                    style={{ width: `${goal.health[key] * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-bark/40 dark:text-muted-foreground w-8 text-right">
                  {Math.round(goal.health[key] * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Cognitive narrative */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-3">
            📖 认知叙事
          </h3>
          <div className="relative pl-4 space-y-3">
            <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-brand-border dark:bg-border" />
            {NARRATIVE_DOTS.map((dot) => (
              <div key={dot.key} className="relative flex items-start gap-2">
                <span
                  className={`mt-0.5 w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                    dot.filled
                      ? "bg-bark dark:bg-foreground border-bark dark:border-foreground"
                      : "bg-cream dark:bg-card border-bark/30 dark:border-foreground/30"
                  }`}
                  style={{ marginLeft: "-8px" }}
                />
                <div>
                  <span className="text-xs font-medium text-bark/70 dark:text-foreground/70">
                    {dot.label}
                  </span>
                  <p className="text-xs text-bark/50 dark:text-muted-foreground mt-0.5">
                    {dot.filled ? "暂无日记引用" : "待解决"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Related records */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-2">
            📝 相关记录
          </h3>
          <p className="text-sm text-bark/60 dark:text-muted-foreground">
            暂无相关记录
          </p>
        </div>

        {/* 4. Deep discussion button */}
        <button
          type="button"
          onClick={() => console.log("[counselor] 深入讨论目标:", goal.goalName)}
          className="w-full py-2.5 text-sm font-medium text-deer border border-deer rounded-lg hover:bg-deer/10 transition-colors"
        >
          💬 深入讨论
        </button>
      </div>
    </div>
  );
}

/* ── Health mini bars (inline in goal card) ── */

function HealthMini({ health }: { health: Goal["health"] }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {HEALTH_LABELS.map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center gap-0.5">
          <div className="w-6 h-1.5 bg-brand-border dark:bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-bark dark:bg-foreground rounded-full"
              style={{ width: `${health[key] * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-bark/40 dark:text-muted-foreground leading-none">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ── */

export default function GoalsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ungrouped, setUngrouped] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionEntry | null>(null);
  const [newGoalInput, setNewGoalInput] = useState(false);
  const [newGoalName, setNewGoalName] = useState("");

  useEffect(() => {
    async function load() {
      try {
        await getDeviceId();
        const panel = await fetchActionPanel();
        const goals: Goal[] = panel.goals.map((g: GoalIndicator) => ({
          goalId: g.goalId,
          goalName: g.goalName,
          actions: [],
          health: { direction: 0.5, resource: 0.5, path: 0.5, drive: 0.5 },
          projectId: null,
        }));
        setProjects([]);
        setUngrouped(goals);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleGoalClick = useCallback((goal: Goal) => {
    setSelectedAction(null);
    setSelectedGoal((prev) => (prev?.goalId === goal.goalId ? null : goal));
  }, []);

  const handleActionClick = useCallback((action: ActionEntry) => {
    setSelectedGoal(null);
    setSelectedAction((prev) => (prev?.id === action.id ? null : action));
  }, []);

  const toggleAction = useCallback((goalId: string, actionId: string) => {
    const update = (goals: Goal[]) =>
      goals.map((g) =>
        g.goalId === goalId
          ? {
              ...g,
              actions: g.actions.map((a) =>
                a.id === actionId ? { ...a, done: !a.done } : a
              ),
            }
          : g
      );
    setUngrouped(update);
    setProjects((prev) =>
      prev.map((p) => ({ ...p, goals: update(p.goals) }))
    );
  }, []);

  const handleDragGoal = useCallback((goalId: string, projectId: string) => {
    console.log("[drag] Move goal", goalId, "to project", projectId);
  }, []);

  const handleCreateGoal = useCallback(() => {
    if (!newGoalName.trim()) return;
    const goal: Goal = {
      goalId: `new-${Date.now()}`,
      goalName: newGoalName.trim(),
      actions: [],
      health: { direction: 0, resource: 0, path: 0, drive: 0 },
      projectId: null,
    };
    setUngrouped((prev) => [...prev, goal]);
    setNewGoalName("");
    setNewGoalInput(false);
    console.log("[POST] create goal:", goal.goalName);
  }, [newGoalName]);

  return (
    <div className="min-h-screen bg-cream dark:bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-bark dark:text-foreground">
          目标看板
        </h1>
      </div>

      {loading && <p className="text-bark/50 dark:text-muted-foreground">加载中…</p>}
      {error && <p className="text-maple">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Projects (three-level nested) */}
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-sand dark:bg-secondary/40 rounded-[12px] border border-brand-border dark:border-border p-5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => console.log("[drop] on project", project.id)}
            >
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-bark dark:text-foreground">
                  {project.name}
                </h2>
                <span className="text-xs px-1.5 py-0.5 rounded bg-bark/10 dark:bg-foreground/10 text-bark dark:text-foreground">
                  项目
                </span>
                <span className="text-xs text-bark/40 dark:text-muted-foreground ml-auto">
                  {project.dateRange}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {project.goals.map((goal) => (
                  <GoalCard
                    key={goal.goalId}
                    goal={goal}
                    onClick={() => handleGoalClick(goal)}
                    onActionClick={handleActionClick}
                    onToggleAction={(actionId) =>
                      toggleAction(goal.goalId, actionId)
                    }
                    isSelected={selectedGoal?.goalId === goal.goalId}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Ungrouped goals */}
          {ungrouped.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-bark/50 dark:text-muted-foreground mb-3">
                未归属目标
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ungrouped.map((goal) => (
                  <GoalCard
                    key={goal.goalId}
                    goal={goal}
                    onClick={() => handleGoalClick(goal)}
                    onActionClick={handleActionClick}
                    onToggleAction={(actionId) =>
                      toggleAction(goal.goalId, actionId)
                    }
                    isSelected={selectedGoal?.goalId === goal.goalId}
                    draggable
                    onDragStart={() =>
                      handleDragGoal(goal.goalId, "")
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {projects.length === 0 && ungrouped.length === 0 && (
            <p className="text-bark/50 dark:text-muted-foreground">暂无目标</p>
          )}

          {/* + 新建目标 */}
          <div className="pt-2">
            {newGoalInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGoal();
                    if (e.key === "Escape") {
                      setNewGoalInput(false);
                      setNewGoalName("");
                    }
                  }}
                  placeholder="输入目标名称…"
                  className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-card border border-brand-border dark:border-border rounded-lg text-bark dark:text-foreground placeholder:text-bark/30 dark:placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-deer"
                />
                <button
                  type="button"
                  onClick={handleCreateGoal}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-deer rounded-lg hover:bg-deer/90 transition-colors"
                >
                  确定
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewGoalInput(false);
                    setNewGoalName("");
                  }}
                  className="px-3 py-1.5 text-sm text-bark/50 dark:text-muted-foreground hover:text-bark dark:hover:text-foreground transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewGoalInput(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-deer border border-deer rounded-lg hover:bg-deer/10 transition-colors"
              >
                + 新建目标
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detail panels */}
      {selectedGoal && (
        <GoalDetailPanel
          goal={selectedGoal}
          onClose={() => setSelectedGoal(null)}
        />
      )}
      {selectedAction && (
        <ActionDetailPanel
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
        />
      )}
    </div>
  );
}

/* ── Goal Card ── */

function GoalCard({
  goal,
  onClick,
  onActionClick,
  onToggleAction,
  isSelected,
  draggable,
  onDragStart,
}: {
  goal: Goal;
  onClick: () => void;
  onActionClick: (action: ActionEntry) => void;
  onToggleAction: (actionId: string) => void;
  isSelected: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`w-full text-left rounded-[8px] bg-white dark:bg-card p-4 shadow-sm border transition-colors cursor-pointer ${
        isSelected
          ? "border-deer ring-1 ring-deer/30"
          : "border-brand-border dark:border-border hover:border-deer/40"
      }`}
    >
      <h3 className="text-sm font-semibold text-bark dark:text-foreground">
        🎯 {goal.goalName}
      </h3>

      {/* Action checkboxes */}
      {goal.actions.length > 0 ? (
        <div className="mt-2 space-y-1">
          {goal.actions.map((action) => (
            <div key={action.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAction(action.id);
                }}
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  action.done
                    ? "border-bark bg-bark dark:border-foreground dark:bg-foreground"
                    : "border-bark/20 dark:border-foreground/20 hover:border-bark/40"
                }`}
                aria-label={action.done ? "标记未完成" : "标记完成"}
              >
                {action.done && (
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2.5 5L4.5 7L7.5 3"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActionClick(action);
                }}
                className={`text-xs text-left hover:underline ${
                  action.done
                    ? "text-bark/40 dark:text-muted-foreground line-through"
                    : "text-bark/70 dark:text-foreground/70"
                }`}
              >
                {action.text}
              </button>
              {/* Skip warning badge */}
              {action.skipCount > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-maple/10 text-maple font-medium">
                  跳过{action.skipCount}次
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-bark/40 dark:text-muted-foreground">
          暂无行动
        </p>
      )}

      {/* Health mini bars */}
      <HealthMini health={goal.health} />
    </div>
  );
}
