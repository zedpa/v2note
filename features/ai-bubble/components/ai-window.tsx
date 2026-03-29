"use client";

import { cn } from "@/lib/utils";
import { useAiWindow } from "../hooks/use-ai-window";
import { useLuluState } from "../hooks/use-lulu-state";
import { LuluMascot } from "./lulu-mascot";
import { LULU_STATE_META, type LuluState } from "../lib/lulu-states";
import { useEffect } from "react";

function formatTime(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** 消息类型 → 小鹿状态 映射 */
const MSG_TO_LULU: Record<string, LuluState> = {
  reflect: "speaking",
  nudge: "caring",
  briefing: "notes",
  summary: "notes",
  relay: "thinking",
  status: "idle",
};

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
  const { luluState, setLuluState } = useLuluState();

  // 根据消息类型自动切换小鹿状态
  useEffect(() => {
    if (!currentMessage) {
      setLuluState("idle");
      return;
    }
    const mapped = MSG_TO_LULU[currentMessage.type];
    if (mapped) setLuluState(mapped);
  }, [currentMessage?.type, currentMessage?.id, setLuluState]);

  if (!currentMessage) return null;

  const meta = LULU_STATE_META[luluState];

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
      {/* Header row: deer + label + state + time */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <LuluMascot state={luluState} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-primary">路路</span>
            <span className="text-muted-foreground/30 text-xs">·</span>
            <span className="text-[11px] text-muted-foreground/50">
              {meta.label}
            </span>
            <span className="flex-1" />
            <span className="text-[11px] text-muted-foreground/40 font-serif-display tabular-nums">
              {formatTime()}
            </span>
          </div>
        </div>
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
