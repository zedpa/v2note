"use client";

import { Loader2 } from "lucide-react";

interface ProcessingIndicatorProps {
  count: number;
}

export function ProcessingIndicator({ count }: ProcessingIndicatorProps) {
  if (count <= 0) return null;

  return (
    <div className="mx-4 mb-4 p-3 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-3">
      <Loader2 className="w-4 h-4 text-primary animate-spin" />
      <span className="text-xs text-foreground">
        {count} 条录音正在 AI 处理中...
      </span>
    </div>
  );
}
