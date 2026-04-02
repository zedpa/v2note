"use client";

import { useState } from "react";
import { Check, Circle, Play, X, Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlanStep {
  index: number;
  description: string;
  toolName?: string;
  needsConfirm?: boolean;
  status?: string;
  result?: string;
}

interface PlanCardProps {
  planId: string;
  intent: string;
  steps: PlanStep[];
  onConfirm: (action: "execute_all" | "execute_modified" | "abandon", modifications?: Array<{ stepIndex: number; description?: string; deleted?: boolean }>) => void;
  confirmed?: boolean;
}

export function PlanCard({ planId, intent, steps: initialSteps, onConfirm, confirmed }: PlanCardProps) {
  const [editing, setEditing] = useState(false);
  const [steps, setSteps] = useState(initialSteps);

  const handleEdit = (index: number, description: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.index === index ? { ...s, description } : s)),
    );
  };

  const handleDelete = (index: number) => {
    setSteps((prev) => prev.filter((s) => s.index !== index));
  };

  const handleExecuteAll = () => {
    onConfirm("execute_all");
  };

  const handleExecuteModified = () => {
    const mods = steps
      .map((s, i) => {
        const orig = initialSteps.find((os) => os.index === s.index);
        if (!orig) return null;
        if (orig.description !== s.description) {
          return { stepIndex: s.index, description: s.description };
        }
        return null;
      })
      .filter(Boolean) as Array<{ stepIndex: number; description?: string; deleted?: boolean }>;

    // 标记被删除的步骤
    for (const orig of initialSteps) {
      if (!steps.find((s) => s.index === orig.index)) {
        mods.push({ stepIndex: orig.index, deleted: true });
      }
    }

    onConfirm("execute_modified", mods.length > 0 ? mods : undefined);
  };

  const handleAbandon = () => {
    onConfirm("abandon");
  };

  const allDone = steps.every((s) => s.status === "done" || s.status === "skipped");
  const running = steps.some((s) => s.status === "running");

  return (
    <div className="flex gap-2.5 mb-4 flex-row">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm mt-0.5">
        🦌
      </div>
      <div className="flex-1 max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-low border border-border/40 overflow-hidden">
        {/* 标题 */}
        <div className="px-4 pt-3 pb-2 border-b border-border/30">
          <p className="text-xs text-muted-foreground font-mono">执行计划</p>
          <p className="text-sm font-medium text-foreground mt-0.5">{intent}</p>
        </div>

        {/* 步骤列表 */}
        <div className="px-4 py-2 space-y-1.5">
          {steps.map((step, i) => (
            <div
              key={step.index}
              className={cn(
                "flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors",
                step.status === "running" && "bg-primary/5",
                step.status === "done" && "opacity-60",
                step.status === "failed" && "bg-destructive/5",
              )}
            >
              {/* 状态图标 */}
              <div className="mt-0.5 shrink-0">
                {step.status === "done" ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : step.status === "running" ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                ) : step.status === "failed" ? (
                  <X className="w-3.5 h-3.5 text-destructive" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
              </div>

              {/* 描述 */}
              <div className="flex-1 min-w-0">
                {editing && !confirmed ? (
                  <input
                    className="w-full text-xs bg-transparent border-b border-primary/30 outline-none py-0.5"
                    value={step.description}
                    onChange={(e) => handleEdit(step.index, e.target.value)}
                  />
                ) : (
                  <p className={cn(
                    "text-xs leading-relaxed",
                    step.status === "done" && "line-through text-muted-foreground",
                  )}>
                    <span className="text-muted-foreground/60 font-mono mr-1">{i + 1}.</span>
                    {step.description}
                  </p>
                )}
                {step.toolName && (
                  <span className="text-[9px] font-mono text-muted-foreground/50 mt-0.5 inline-block">
                    {step.toolName}
                  </span>
                )}
                {step.result && step.status === "done" && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {step.result.length > 80 ? step.result.slice(0, 80) + "..." : step.result}
                  </p>
                )}
              </div>

              {/* 编辑时的删除按钮 */}
              {editing && !confirmed && (
                <button
                  type="button"
                  onClick={() => handleDelete(step.index)}
                  className="shrink-0 p-0.5 rounded hover:bg-destructive/10"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        {!confirmed && !allDone && !running && (
          <div className="px-4 py-3 border-t border-border/30 flex gap-2">
            <button
              type="button"
              onClick={handleExecuteAll}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 active:bg-primary/80 transition-colors select-none"
            >
              <Play className="w-3 h-3" />
              全部执行
            </button>
            <button
              type="button"
              onClick={() => {
                if (editing) handleExecuteModified();
                else setEditing(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 active:bg-secondary/70 transition-colors select-none"
            >
              <Pencil className="w-3 h-3" />
              {editing ? "确认修改" : "修改后执行"}
            </button>
            <button
              type="button"
              onClick={handleAbandon}
              className="py-2 px-3 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 transition-colors select-none"
            >
              算了
            </button>
          </div>
        )}

        {/* 执行中/完成状态 */}
        {(running || allDone) && (
          <div className="px-4 py-2 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground text-center">
              {running ? "执行中..." : allDone ? "计划已完成" : ""}
            </p>
          </div>
        )}

        {confirmed && !running && !allDone && (
          <div className="px-4 py-2 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground text-center">已确认，准备执行...</p>
          </div>
        )}
      </div>
    </div>
  );
}
