"use client";

import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Review } from "@/shared/lib/types";

interface ReviewListProps {
  reviews: Review[];
  onSelect: (review: Review) => void;
}

const PERIOD_LABELS: Record<string, string> = {
  daily: "日报",
  weekly: "周报",
  monthly: "月报",
};

export function ReviewList({ reviews, onSelect }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        暂无复盘记录
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">历史复盘</h3>
      {reviews.map((review) => (
        <button
          key={review.id}
          type="button"
          onClick={() => onSelect(review)}
          className="w-full text-left rounded-lg border border-border/60 p-3 hover:bg-secondary/40 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {PERIOD_LABELS[review.period] ?? review.period}
            </Badge>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {new Date(review.period_start).toLocaleDateString("zh-CN")} -{" "}
              {new Date(review.period_end).toLocaleDateString("zh-CN")}
            </span>
          </div>
          <p className="text-sm text-foreground line-clamp-2">
            {review.summary}
          </p>
        </button>
      ))}
    </div>
  );
}
