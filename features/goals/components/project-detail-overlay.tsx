"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, MoreVertical, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { listGoals, listGoalTodos } from "@/shared/lib/api/goals";
import type { Goal } from "@/shared/lib/types";

interface ProjectDetailOverlayProps {
  /** 项目 = 顶层 goal (parent_id=null)，子 goal 归属其下 */
  projectId: string;
  onClose: () => void;
  onViewGoal?: (goalId: string) => void;
}

interface GoalWithTodos {
  goal: Goal;
  todos: Array<{ id: string; text: string; done: boolean }>;
}

export function ProjectDetailOverlay({
  projectId,
  onClose,
  onViewGoal,
}: ProjectDetailOverlayProps) {
  const [project, setProject] = useState<Goal | null>(null);
  const [goalGroups, setGoalGroups] = useState<GoalWithTodos[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listGoals()
      .then(async (allGoals) => {
        const proj = allGoals.find((g) => g.id === projectId) || null;
        setProject(proj);

        // 找到所有子目标
        const children = allGoals.filter(
          (g) => g.parent_id === projectId && g.status === "active",
        );

        // 加载每个子目标的待办
        const groups = await Promise.all(
          children.map(async (child) => {
            const todos = await listGoalTodos(child.id).catch(() => []);
            return { goal: child, todos };
          }),
        );

        // 也加载项目本身的直属待办
        const projectTodos = await listGoalTodos(projectId).catch(() => []);
        if (projectTodos.length > 0) {
          setGoalGroups([
            { goal: proj!, todos: projectTodos },
            ...groups,
          ]);
        } else {
          setGoalGroups(groups);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // 统计
  const allTodos = goalGroups.flatMap((g) => g.todos);
  const totalCount = allTodos.length;
  const doneCount = allTodos.filter((t) => t.done).length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const updatedDate = project?.updated_at
    ? new Date(project.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).toUpperCase()
    : "";

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
        <span className="text-sm text-muted-accessible">Project Details</span>
        <button className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible">
          <MoreVertical size={18} />
        </button>
      </header>

      {loading ? (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-low animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="px-5 pb-24">
          {/* 元数据 + 标题 (Stitch style) */}
          <section className="pt-6 pb-2">
            <p className="text-[10px] font-mono text-muted-accessible tracking-widest uppercase">
              PROJECT · UPDATED {updatedDate}
            </p>
            <h1 className="font-serif text-3xl text-on-surface mt-1 leading-tight">
              {project?.title || "项目"}
            </h1>
          </section>

          {/* 目标分组 + 待办 */}
          {goalGroups.map((group) => (
            <section key={group.goal.id} className="pt-8">
              <button
                onClick={() => onViewGoal?.(group.goal.id)}
                className="font-serif text-lg text-on-surface hover:text-deer transition-colors text-left"
              >
                {group.goal.id === projectId ? "直属待办" : group.goal.title}
              </button>
              <div className="mt-2 space-y-0.5">
                {group.todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={cn(
                      "flex items-center gap-3 py-2.5 min-h-[44px] rounded-lg",
                      todo.done ? "bg-surface-high" : "bg-transparent",
                    )}
                  >
                    {todo.done ? (
                      <div className="w-5 h-5 rounded-full bg-deer/20 flex items-center justify-center shrink-0 ml-1">
                        <Check size={12} className="text-deer" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-accessible/40 shrink-0 ml-1" />
                    )}
                    <span
                      className={cn(
                        "text-sm",
                        todo.done
                          ? "line-through text-muted-accessible"
                          : "text-on-surface",
                      )}
                    >
                      {todo.text}
                    </span>
                  </div>
                ))}
                {group.todos.length === 0 && (
                  <p className="text-xs text-muted-accessible py-2 ml-1">暂无待办</p>
                )}
              </div>
            </section>
          ))}

          {goalGroups.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-serif text-xl text-muted-accessible">暂无子目标</p>
              <p className="text-sm text-muted-accessible mt-2">对路路说说你的想法</p>
            </div>
          )}

          {/* 底部统计 (Stitch style) */}
          {totalCount > 0 && (
            <section className="pt-10">
              <div className="h-px bg-ghost-border mb-6" />
              <p className="text-[10px] font-mono text-muted-accessible tracking-widest uppercase mb-2">
                STATS
              </p>
              <p className="font-serif text-5xl text-on-surface">{progressPct}%</p>
              <p className="text-sm text-muted-accessible mt-1">
                Complete · {doneCount}/{totalCount} tasks
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
