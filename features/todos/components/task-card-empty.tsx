"use client";

import { Plus } from "lucide-react";

interface TaskCardEmptyProps {
  hint: string;
  onAdd: () => void;
}

export function TaskCardEmpty({ hint, onAdd }: TaskCardEmptyProps) {
  return (
    <button
      data-testid="task-card-empty"
      onClick={onAdd}
      className="flex w-full items-center justify-between rounded-xl border-[1.5px] border-dashed border-border bg-card/40 p-4 text-left text-sm text-muted-foreground transition-colors active:bg-card/60"
    >
      <span>{hint}</span>
      <div
        data-testid="add-btn"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
      >
        <Plus className="h-4 w-4" />
      </div>
    </button>
  );
}
