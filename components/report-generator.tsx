"use client";

import { useState } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReport, type ReportPeriod } from "@/hooks/use-report";
import { SwipeBack } from "./swipe-back";

interface ReportGeneratorProps {
  defaultPeriod?: ReportPeriod;
  onClose: () => void;
}

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "daily", label: "日报" },
  { key: "weekly", label: "周报" },
  { key: "monthly", label: "月报" },
  { key: "yearly", label: "年报" },
];

export function ReportGenerator({ defaultPeriod, onClose }: ReportGeneratorProps) {
  const [period, setPeriod] = useState<ReportPeriod>(defaultPeriod ?? "weekly");
  const { result, loading, error, generate } = useReport();

  return (
    <SwipeBack onClose={onClose}>
      {/* Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 flex items-center justify-between p-4 border-b border-border/50">
        <h1 className="text-lg font-bold text-foreground">生成报告</h1>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Period selector */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">选择时间范围</p>
          <div className="flex gap-2">
            {PERIODS.map(({ key, label }) => (
              <button
                type="button"
                key={key}
                onClick={() => setPeriod(key)}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all",
                  period === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={() => generate(period)}
          disabled={loading}
          className={cn(
            "w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            loading && "opacity-60 pointer-events-none",
          )}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AI 生成中...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              生成{PERIODS.find((p) => p.key === period)?.label}
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="p-4 rounded-2xl bg-card border border-border/60 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-accent">{result.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {"基于 "}
              {result.record_count}
              {" 条笔记"}
            </p>
            {result.summary ? (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {result.summary}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {result.message ?? "该时段暂无笔记数据"}
              </p>
            )}
          </div>
        )}
      </div>
    </SwipeBack>
  );
}
