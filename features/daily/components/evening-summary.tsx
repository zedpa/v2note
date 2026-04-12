"use client";

import { SwipeBack } from "@/shared/components/swipe-back";
import { Loader2, CheckCircle2, RefreshCw, Calendar, Sparkles, Heart } from "lucide-react";
import { useEveningSummary } from "../hooks/use-daily-briefing";
import { cn } from "@/lib/utils";

interface EveningSummaryProps {
  onClose: () => void;
}

export function EveningSummary({ onClose }: EveningSummaryProps) {
  const { summary, loading, error, refresh } = useEveningSummary();

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-surface pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur-[12px]">
          <h1 className="text-lg font-serif text-on-surface">每日回顾</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh(true)}
              className="p-1.5 rounded-full hover:bg-surface-low transition-colors"
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4 text-muted-accessible", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-surface-low transition-colors"
            >
              <span className="text-muted-accessible text-lg">&times;</span>
            </button>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && !summary && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-accessible" />
            <span className="ml-2 text-muted-accessible text-sm">正在生成总结...</span>
          </div>
        )}

        {error && !summary && (
          <div className="flex-1 flex items-center justify-center text-muted-accessible text-sm">
            <div className="text-center">
              <p>加载失败: {error}</p>
              <button type="button" onClick={() => refresh()} className="mt-2 text-deer underline">重试</button>
            </div>
          </div>
        )}

        {/* 内容 */}
        {summary && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Headline */}
            <p className="font-serif text-2xl text-on-surface leading-relaxed">
              {summary.headline}
            </p>

            {/* 完成 */}
            {summary.accomplishments.length > 0 && (
              <Section title="完成">
                {summary.accomplishments.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-forest mt-0.5 shrink-0" />
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* 今日亮点 */}
            {summary.insight ? (
              <Section title="今日亮点">
                <div className="flex items-start gap-2 py-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-on-surface leading-relaxed">{summary.insight}</p>
                </div>
              </Section>
            ) : null}

            {/* 每日肯定 */}
            {summary.affirmation ? (
              <div className="bg-surface-lowest rounded-xl px-4 py-3 flex items-start gap-2">
                <Heart className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-sm text-on-surface italic">{summary.affirmation}</p>
              </div>
            ) : null}

            {/* 明日预告 */}
            {summary.tomorrow_preview.length > 0 && (
              <Section title="明天">
                {summary.tomorrow_preview.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5">
                    <Calendar className="w-4 h-4 text-sky mt-0.5 shrink-0" />
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* 统计 */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="完成" value={String(summary.stats.done)} />
              <StatCard label="记录" value={String(summary.stats.new_records)} />
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              晚安
            </button>
          </div>
        )}
      </div>
    </SwipeBack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-0.5 h-4 bg-deer rounded-full" />
        <h3 className="text-sm font-medium text-on-surface">{title}</h3>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-lowest rounded-xl p-4 shadow-ambient">
      <p className="font-serif text-3xl text-on-surface">{value}</p>
      <p className="text-xs text-muted-accessible mt-1">{label}</p>
    </div>
  );
}
