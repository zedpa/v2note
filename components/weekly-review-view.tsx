"use client";

import { CalendarDays, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWeeklyReview } from "@/hooks/use-weekly-review";
import { WeeklyReviewCard } from "./weekly-review-card";

export function WeeklyReviewView() {
  const { reviews, loading, generating, generate } = useWeeklyReview();

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Generate button */}
      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-colors",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          generating && "opacity-50 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("w-4 h-4", generating && "animate-spin")} />
        {generating ? "生成中..." : "生成本周周盘"}
      </button>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && reviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CalendarDays className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">还没有周盘</p>
          <p className="text-xs mt-1">点击上方按钮生成第一份周盘</p>
        </div>
      )}

      {/* Review list */}
      {!loading && reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((review) => (
            <WeeklyReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
