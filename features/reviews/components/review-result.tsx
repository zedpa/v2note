"use client";

import { Mic, Calendar, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/shared/components/markdown-content";
import type { Review } from "@/shared/lib/types";

/** Replace ISO date strings with readable Chinese dates */
function cleanDates(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, (match) => {
    return new Date(match).toLocaleString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  });
}

interface ReviewResultProps {
  review: Review;
  onRegenerate: () => void;
  generating: boolean;
}

const PERIOD_LABELS: Record<string, string> = {
  daily: "日报",
  weekly: "周报",
  monthly: "月报",
};

export function ReviewResult({ review, onRegenerate, generating }: ReviewResultProps) {
  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary">
          {PERIOD_LABELS[review.period] ?? review.period}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          {new Date(review.period_start).toLocaleDateString("zh-CN")} -{" "}
          {new Date(review.period_end).toLocaleDateString("zh-CN")}
        </div>
        {review.stats?.total_records != null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mic className="w-3 h-3" />
            {review.stats.total_records} 条录音
          </div>
        )}
      </div>

      {/* Review content */}
      <div className="rounded-lg border border-border/60 p-4">
        <MarkdownContent className="text-foreground">
          {cleanDates(review.summary)}
        </MarkdownContent>
      </div>

      {/* Regenerate button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={onRegenerate}
        disabled={generating}
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${generating ? "animate-spin" : ""}`} />
        {generating ? "重新生成中..." : "重新生成"}
      </Button>
    </div>
  );
}
