"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, Plus, ChevronRight, Sparkles, Check, X, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoals } from "../hooks/use-goals";
import { SwipeBack } from "@/shared/components/swipe-back";

interface GoalListProps {
  onClose: () => void;
  onViewGoal: (goalId: string) => void;
  onViewProject: (projectId: string) => void;
}

export function GoalList({ onClose, onViewGoal, onViewProject }: GoalListProps) {
  const { projects, suggested, getChildren, create, confirm, dismiss, archive, loading } = useGoals();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      await create(title);
      setNewTitle("");
      setShowCreate(false);
    } catch {
      // 静默
    } finally {
      setCreating(false);
    }
  }, [newTitle, create]);

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-surface pt-safe">
        {/* Header */}
        <header
          className="flex items-center gap-3 px-4 h-[44px] bg-surface/80 backdrop-blur-[12px] shrink-0"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="返回"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="flex-1 font-serif text-lg text-on-surface">我的目标</h1>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full text-deer hover:text-deer-dark transition-colors"
            aria-label="新建目标"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-center text-sm text-muted-accessible py-8">加载中...</p>
          ) : projects.length === 0 && suggested.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-serif text-lg text-on-surface mb-2">暂无目标</p>
              <p className="text-sm text-muted-accessible">说出你想做的事，路路会帮你追踪</p>
            </div>
          ) : (
            <>
              {/* Active goals/projects */}
              {projects.map((goal) => {
                const children = getChildren(goal.id);
                const isProject = children.length > 0;

                return (
                  <div key={goal.id} className="mb-3">
                    <button
                      type="button"
                      onClick={() => isProject ? onViewProject(goal.id) : onViewGoal(goal.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-lowest hover:bg-surface-low transition-colors text-left pressable"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">
                          {goal.title}
                        </p>
                        <p className="text-[11px] text-muted-accessible mt-0.5">
                          {statusLabel(goal.status)}
                          {isProject && ` · ${children.length} 个子目标`}
                          {goal.wiki_page_title && (
                            <span className="text-deer/70"> · {goal.wiki_page_title}</span>
                          )}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-muted-accessible/40 shrink-0" />
                    </button>

                    {/* 长按归档 */}
                    {goal.status !== "completed" && goal.status !== "abandoned" && (
                      <div className="flex justify-end px-2 mt-1">
                        <button
                          type="button"
                          onClick={() => archive(goal.id)}
                          className="text-[10px] text-muted-accessible/40 hover:text-maple transition-colors flex items-center gap-1"
                        >
                          <Archive size={10} /> 归档
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Suggested goals */}
              {suggested.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={14} className="text-deer" />
                    <p className="text-xs font-medium text-muted-accessible">路路发现的目标</p>
                  </div>

                  {suggested.map((goal) => (
                    <div
                      key={goal.id}
                      className="flex items-center gap-3 px-4 py-3 mb-2 rounded-2xl bg-deer/5 border border-deer/10"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-on-surface truncate">{goal.title}</p>
                        <p className="text-[10px] text-deer">
                          新 · 来自涌现分析
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => confirm(goal.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-deer/10 text-deer hover:bg-deer/20 transition-colors"
                        aria-label="确认"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss(goal.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-high text-muted-accessible hover:text-maple transition-colors"
                        aria-label="忽略"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Create dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center">
            <div className="w-full max-w-sm bg-surface rounded-t-2xl px-6 py-6 pb-safe animate-slide-up">
              <h2 className="font-serif text-lg text-on-surface mb-4">新建目标</h2>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="描述你想达成的事..."
                autoFocus
                className="w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-sm outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30"
              />
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewTitle(""); }}
                  className="flex-1 h-10 rounded-xl bg-surface-high text-sm text-muted-accessible"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || creating}
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
                >
                  {creating ? "创建中..." : "创建"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SwipeBack>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "active": return "进行中";
    case "progressing": return "推进中";
    case "blocked": return "受阻";
    case "paused": return "暂停";
    case "completed": return "已完成";
    case "abandoned": return "已放弃";
    default: return status;
  }
}
