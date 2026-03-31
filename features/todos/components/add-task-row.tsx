"use client";

import { Plus } from "lucide-react";

interface AddTaskRowProps {
  onAdd: () => void;
}

export function AddTaskRow({ onAdd }: AddTaskRowProps) {
  return (
    <button
      data-testid="add-task-row"
      onClick={onAdd}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-destructive transition-colors active:bg-card/40"
    >
      <Plus className="h-[18px] w-[18px]" />
      <span className="text-sm font-medium">添加任务</span>
    </button>
  );
}
