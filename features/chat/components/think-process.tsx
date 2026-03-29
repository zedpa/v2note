"use client";

import { useState } from "react";
import { Loader2, ChevronDown, ChevronUp, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkProcessProps {
  phases: Array<{ phase: string; detail: string }>;
  elapsed: number; // seconds
  done: boolean;
}

export function ThinkProcess({ phases, elapsed, done }: ThinkProcessProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (phases.length === 0 && done) return null;

  return (
    <div className="bg-surface-low rounded-xl p-3 my-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {!done ? (
            <Loader2 size={14} className="text-deer animate-spin shrink-0" />
          ) : (
            <BrainCircuit size={14} className="text-muted-accessible shrink-0" />
          )}
          <p className="text-xs text-muted-accessible">
            {collapsed
              ? done
                ? `深度思考了 ${elapsed} 秒`
                : `路路正在深度思考... ${elapsed}s`
              : done
                ? `深度思考完成 (${elapsed}s)`
                : "路路正在深度思考..."
            }
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
          aria-label={collapsed ? "展开思考过程" : "收起思考过程"}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Phase list */}
      {!collapsed && (
        <div className="mt-2 space-y-1 font-mono text-xs">
          {phases.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={cn(
                "shrink-0 mt-px",
                i === phases.length - 1 && !done
                  ? "text-deer"
                  : "text-muted-accessible",
              )}>
                {i === phases.length - 1 && !done ? ">" : "\u2713"}
              </span>
              <div className="min-w-0">
                <span className="text-on-surface">{p.phase}</span>
                {p.detail && (
                  <span className="text-muted-accessible ml-1.5">{p.detail}</span>
                )}
              </div>
            </div>
          ))}
          {!done && (
            <div className="flex items-center gap-2 text-muted-accessible">
              <Loader2 size={10} className="animate-spin" />
              <span>处理中...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
