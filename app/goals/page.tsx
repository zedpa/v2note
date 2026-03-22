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
  goals: Goal[];
}

/* ── Health bar labels ── */
const HEALTH_LABELS: { key: keyof Goal["health"]; label: string }[] = [
  { key: "direction", label: "方向" },
  { key: "resource", label: "资源" },
  { key: "path", label: "路径" },
  { key: "drive", label: "驱动" },
];

/* ── Detail panel (right 360px) ── */

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
        {/* Health bars */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-3">
            目标健康度
          </h3>
          <div className="space-y-2">
            {HEALTH_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-bark/60 dark:text-muted-foreground w-8">
                  {label}
                </span>
                <div className="flex-1 h-2 bg-sand dark:bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${goal.health[key] * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cognitive narrative */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-2">
            路路的洞察
          </h3>
          <p className="text-sm text-bark/60 dark:text-muted-foreground">
            暂无认知叙事
          </p>
        </div>

        {/* Related records */}
        <div>
          <h3 className="text-sm font-semibold text-bark dark:text-foreground mb-2">
            相关记录
          </h3>
          <p className="text-sm text-bark/60 dark:text-muted-foreground">
            暂无相关记录
          </p>
        </div>
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
          <div className="w-6 h-1.5 bg-sand dark:bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
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

  useEffect(() => {
    async function load() {
      try {
        await getDeviceId();
        const panel = await fetchActionPanel();
        // TODO: replace with real project/goal/action API when available
        // For now, map GoalIndicator[] into the three-level structure
        const goals: Goal[] = panel.goals.map((g: GoalIndicator) => ({
          goalId: g.goalId,
          goalName: g.goalName,
          actions: [],
          health: { direction: 0.5, resource: 0.5, path: 0.5, drive: 0.5 },
          projectId: null,
        }));
        // All goals are ungrouped until project API exists
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
    setSelectedGoal((prev) => (prev?.goalId === goal.goalId ? null : goal));
  }, []);

  return (
    <div className="min-h-screen bg-cream dark:bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-bark dark:text-foreground">
          目标看板
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-lg transition-colors"
        >
          + 新建目标
        </button>
      </div>

      {loading && <p className="text-muted-foreground">加载中…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Projects (three-level nested) */}
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-sand dark:bg-secondary/40 rounded-[12px] p-5"
            >
              <h2 className="text-lg font-semibold text-bark dark:text-foreground mb-4">
                {project.name}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {project.goals.map((goal) => (
                  <GoalCard
                    key={goal.goalId}
                    goal={goal}
                    onClick={() => handleGoalClick(goal)}
                    isSelected={selectedGoal?.goalId === goal.goalId}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Ungrouped goals */}
          {ungrouped.length > 0 && (
            <div>
              {projects.length > 0 && (
                <h2 className="text-sm font-semibold text-bark/50 dark:text-muted-foreground mb-3">
                  未归属目标
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ungrouped.map((goal) => (
                  <GoalCard
                    key={goal.goalId}
                    goal={goal}
                    onClick={() => handleGoalClick(goal)}
                    isSelected={selectedGoal?.goalId === goal.goalId}
                  />
                ))}
              </div>
            </div>
          )}

          {projects.length === 0 && ungrouped.length === 0 && (
            <p className="text-muted-foreground">暂无目标</p>
          )}
        </div>
      )}

      {/* Detail panel */}
      {selectedGoal && (
        <GoalDetailPanel
          goal={selectedGoal}
          onClose={() => setSelectedGoal(null)}
        />
      )}
    </div>
  );
}

/* ── Goal Card ── */

function GoalCard({
  goal,
  onClick,
  isSelected,
}: {
  goal: Goal;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg bg-white dark:bg-card p-4 shadow-sm border transition-colors ${
        isSelected
          ? "border-primary ring-1 ring-primary/30"
          : "border-brand-border dark:border-border hover:border-primary/40"
      }`}
    >
      <h3 className="text-sm font-semibold text-bark dark:text-foreground">
        {goal.goalName}
      </h3>

      {/* Action checkboxes */}
      {goal.actions.length > 0 ? (
        <div className="mt-2 space-y-1">
          {goal.actions.map((action) => (
            <div key={action.id} className="flex items-center gap-2">
              <div
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  action.done
                    ? "border-primary bg-primary"
                    : "border-bark/20 dark:border-foreground/20"
                }`}
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
              </div>
              <span
                className={`text-xs ${
                  action.done
                    ? "text-bark/40 dark:text-muted-foreground line-through"
                    : "text-bark/70 dark:text-foreground/70"
                }`}
              >
                {action.text}
              </span>
              {/* Skip warning badge */}
              {action.skipCount > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                  跳过 {action.skipCount}
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
    </button>
  );
}
