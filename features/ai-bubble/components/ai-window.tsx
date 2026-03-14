"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiWindow } from "../hooks/use-ai-window";

function formatTime(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function AiWindow({
  onOpenChat,
  onOpenOverlay,
}: {
  onOpenChat?: (initial?: string) => void;
  onOpenOverlay?: (name: string) => void;
}) {
  const { currentMessage, handleTap } = useAiWindow({
    onOpenChat,
    onOpenOverlay,
  });

  if (!currentMessage) return null;

  return (
    <div
      onClick={handleTap}
      className={cn(
        "mb-4 rounded-2xl cursor-pointer select-none",
        "transition-all duration-300",
        "animate-bubble-enter",
        "bg-[hsl(25,30%,95%)] dark:bg-[hsl(25,8%,14%)]",
      )}
    >
      {/* Header row: icon + label + time */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Star className="w-3.5 h-3.5 text-primary fill-primary" />
        <span className="text-xs font-medium text-primary">日常 AI</span>
        <span className="text-muted-foreground/40 mx-0.5">|</span>
        <span className="text-xs text-muted-foreground/50 font-serif-display tabular-nums">
          {formatTime()}
        </span>
      </div>

      {/* Message body */}
      <div className="px-4 pb-3.5 pt-1">
        <p className="text-[15px] leading-relaxed text-foreground/80 line-clamp-4">
          {currentMessage.text}
        </p>
      </div>
    </div>
  );
}
