"use client";

import { cn } from "@/lib/utils";

export interface InsightCardProps {
  text: string;
  onDetail?: () => void;
}

export function InsightCard({ text, onDetail }: InsightCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 bg-[#FFF8F0] border-l-[3px] border-dawn",
        "animate-card-enter",
      )}
    >
      {/* Top label */}
      <span className="text-xs font-medium text-dawn">
        🦌 路路发现
      </span>

      {/* Insight body */}
      <p className="mt-2 text-[13px] text-muted-accessible leading-relaxed">
        {text}
      </p>

      {/* Detail link */}
      {onDetail && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onDetail}
            className="text-xs text-antler hover:underline transition-colors"
          >
            详细了解 →
          </button>
        </div>
      )}
    </div>
  );
}
