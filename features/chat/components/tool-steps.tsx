"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolStep {
  toolName: string;
  status: "running" | "done" | "error";
  result?: string;
}

interface ToolStepsProps {
  steps: ToolStep[];
  collapsed?: boolean;
  onToggle?: () => void;
}

function StatusIcon({ status }: { status: ToolStep["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={14} className="text-green-600 shrink-0" />;
    case "running":
      return <Loader2 size={14} className="text-deer animate-spin shrink-0" />;
    case "error":
      return <XCircle size={14} className="text-red-500 shrink-0" />;
  }
}

export function ToolSteps({ steps, collapsed: controlledCollapsed, onToggle }: ToolStepsProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const hasRunning = steps.some((s) => s.status === "running");

  return (
    <div className="bg-surface-low rounded-xl p-3 my-2">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-accessible">
          {collapsed
            ? hasRunning
              ? `路路正在执行第 ${doneCount + 1} 步...`
              : `路路用了 ${steps.length} 步完成`
            : "执行步骤"
          }
        </p>
        <button
          type="button"
          onClick={handleToggle}
          className="w-6 h-6 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
          aria-label={collapsed ? "展开步骤" : "收起步骤"}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Step list */}
      {!collapsed && (
        <div className="mt-2 space-y-1.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="mt-0.5">
                <StatusIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-xs",
                  step.status === "running" ? "text-on-surface font-medium" : "text-on-surface",
                )}>
                  {step.toolName}
                </p>
                {step.result && (
                  <p className="text-xs text-muted-accessible mt-0.5 truncate">
                    {step.result}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
