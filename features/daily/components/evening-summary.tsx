"use client";

import { useState } from "react";
import { SwipeBack } from "@/shared/components/swipe-back";
import { Loader2, CheckCircle2, Clock, RefreshCw, Brain, Target, AlertTriangle, Calendar, ArrowRight, MessageCircle } from "lucide-react";
import { useEveningSummary } from "../hooks/use-daily-briefing";
import { cn } from "@/lib/utils";

interface EveningSummaryProps {
  onClose: () => void;
  onOpenChat?: (initial?: string) => void;
}

export function EveningSummary({ onClose, onOpenChat }: EveningSummaryProps) {
  const { summary, loading, error, refresh } = useEveningSummary();
  const [currentCard, setCurrentCard] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

  const totalCards = 3;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) {
      if (dx < 0 && currentCard < totalCards - 1) setCurrentCard((c) => c + 1);
      if (dx > 0 && currentCard > 0) setCurrentCard((c) => c - 1);
    }
  };

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-surface pt-safe">
        {/* Header — Glass & Soul */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur-[12px]">
          <h1 className="text-lg font-serif text-on-surface">日终总结</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
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
              <button type="button" onClick={refresh} className="mt-2 text-deer underline">重试</button>
            </div>
          </div>
        )}

        {/* 卡片横滑区 */}
        {summary && (
          <div className="flex-1 flex flex-col">
            {/* 分页指示器 */}
            <div className="flex items-center justify-center gap-2 py-4">
              {Array.from({ length: totalCards }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentCard(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-200",
                    i === currentCard ? "bg-deer w-4" : "bg-surface-high",
                  )}
                />
              ))}
            </div>

            {/* 横滑容器 */}
            <div
              className="flex-1 overflow-hidden"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="flex h-full transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${currentCard * 100}%)` }}
              >
                {/* 卡片1: 今日行动 */}
                <div className="w-full shrink-0 px-5 overflow-y-auto">
                  <div className="space-y-6 pb-8">
                    <h2 className="font-serif text-2xl text-on-surface">今日行动</h2>

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

                    {summary.goal_updates.length > 0 && (
                      <Section title="目标进展">
                        {summary.goal_updates.map((goal, i) => (
                          <div key={i} className="py-1.5">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-deer mt-0.5 shrink-0" />
                              <span className="text-sm font-medium text-on-surface">{goal.title}</span>
                              <span className="text-xs text-muted-accessible">+{goal.completed_count} / 余{goal.remaining_count}</span>
                            </div>
                            {goal.note && <p className="ml-6 text-xs text-muted-accessible mt-0.5">{goal.note}</p>}
                          </div>
                        ))}
                      </Section>
                    )}

                    {summary.attention_needed.length > 0 && (
                      <Section title="需要关注">
                        {summary.attention_needed.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 py-1.5">
                            <AlertTriangle className="w-4 h-4 text-dawn mt-0.5 shrink-0" />
                            <span className="text-sm text-on-surface">{item}</span>
                          </div>
                        ))}
                      </Section>
                    )}
                  </div>
                </div>

                {/* 卡片2: 路路的发现 */}
                <div className="w-full shrink-0 px-5 overflow-y-auto">
                  <div className="space-y-6 pb-8">
                    <h2 className="font-serif text-2xl text-on-surface">路路的发现</h2>

                    {summary.cognitive_highlights.length > 0 ? (
                      <Section title="今日思考">
                        {summary.cognitive_highlights.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 py-1.5">
                            <Brain className="w-4 h-4 text-sky mt-0.5 shrink-0" />
                            <span className="text-sm text-on-surface">{item}</span>
                          </div>
                        ))}
                      </Section>
                    ) : (
                      <p className="text-sm text-muted-accessible">今天没有新发现，明天继续加油</p>
                    )}

                    {summary.relay_summary.length > 0 && (
                      <Section title="转达状态">
                        {summary.relay_summary.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 py-1.5">
                            <ArrowRight className="w-4 h-4 text-sky mt-0.5 shrink-0" />
                            <span className="text-sm text-on-surface">{item}</span>
                          </div>
                        ))}
                      </Section>
                    )}

                    {summary.tomorrow_preview && (
                      <Section title="明日预告">
                        {summary.tomorrow_preview.scheduled.map((item, i) => (
                          <div key={`s-${i}`} className="flex items-start gap-2 py-1.5">
                            <Calendar className="w-4 h-4 text-sky mt-0.5 shrink-0" />
                            <span className="text-sm text-on-surface">{item}</span>
                          </div>
                        ))}
                        {summary.tomorrow_preview.carry_over.map((item, i) => (
                          <div key={`c-${i}`} className="flex items-start gap-2 py-1.5">
                            <Clock className="w-4 h-4 text-dawn mt-0.5 shrink-0" />
                            <span className="text-sm text-on-surface">{item}</span>
                          </div>
                        ))}
                      </Section>
                    )}
                  </div>
                </div>

                {/* 卡片3: 统计 + 互动 */}
                <div className="w-full shrink-0 px-5 overflow-y-auto">
                  <div className="space-y-6 pb-8">
                    <h2 className="font-serif text-2xl text-on-surface">今日数据</h2>

                    <div className="grid grid-cols-2 gap-4">
                      <StatCard label="完成" value={String(summary.stats.done)} />
                      <StatCard label="记录" value={String(summary.stats.new_records)} />
                      {summary.stats.new_strikes > 0 && (
                        <StatCard label="认知" value={String(summary.stats.new_strikes)} />
                      )}
                      {summary.stats.relays_completed > 0 && (
                        <StatCard label="转达" value={String(summary.stats.relays_completed)} />
                      )}
                    </div>

                    {onOpenChat && (
                      <button
                        type="button"
                        onClick={() => onOpenChat("和路路聊聊今天")}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white transition-opacity"
                        style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
                      >
                        <MessageCircle size={16} />
                        和路路聊聊今天
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
