"use client";

import { SwipeBack } from "@/shared/components/swipe-back";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { useEveningSummary } from "../hooks/use-daily-briefing";

interface EveningSummaryProps {
  onClose: () => void;
}

export function EveningSummary({ onClose }: EveningSummaryProps) {
  const { summary, loading, error, refresh } = useEveningSummary();

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-background pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <h1 className="text-lg font-bold text-foreground">日终总结</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
            >
              <span className="text-muted-foreground text-lg">&times;</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-5">
            {loading && !summary && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground text-sm">正在生成总结...</span>
              </div>
            )}

            {error && !summary && (
              <div className="text-center py-20 text-muted-foreground text-sm">
                <p>加载失败: {error}</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-2 text-primary underline"
                >
                  重试
                </button>
              </div>
            )}

            {summary && (
              <>
                {/* Accomplishments */}
                {summary.accomplishments.length > 0 && (
                  <Section title="今日成果">
                    {summary.accomplishments.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Pending */}
                {summary.pending_items.length > 0 && (
                  <Section title="待跟进">
                    {summary.pending_items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <Clock className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Relay Summary */}
                {summary.relay_summary.length > 0 && (
                  <Section title="转达状态">
                    {summary.relay_summary.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Tomorrow Seeds */}
                {summary.tomorrow_seeds.length > 0 && (
                  <Section title="明日预告">
                    {summary.tomorrow_seeds.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="text-sm mt-0.5">🌱</span>
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Stats */}
                <div className="bg-secondary/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">今日数据</p>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-foreground">
                      ✅ {summary.stats.done} 项完成
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">
                      📝 {summary.stats.new_records} 条记录
                    </span>
                    {summary.stats.relays_completed > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-foreground">
                          📨 {summary.stats.relays_completed} 条转达
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </SwipeBack>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-0.5 h-4 bg-primary rounded-full" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  );
}
