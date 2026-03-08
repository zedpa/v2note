"use client";

import { SwipeBack } from "@/shared/components/swipe-back";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, Circle, ArrowRight, RefreshCw } from "lucide-react";
import { useDailyBriefing, markRelayDone } from "../hooks/use-daily-briefing";
import { useState } from "react";

interface MorningBriefingProps {
  onClose: () => void;
}

export function MorningBriefing({ onClose }: MorningBriefingProps) {
  const { briefing, loading, error, refresh } = useDailyBriefing();
  const [relayDone, setRelayDone] = useState<Set<string>>(new Set());

  const now = new Date();
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;

  const handleRelayDone = async (todoId: string) => {
    if (!todoId || relayDone.has(todoId)) return;
    try {
      await markRelayDone(todoId);
      setRelayDone((prev) => new Set(prev).add(todoId));
    } catch {
      // ignore
    }
  };

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-background pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <h1 className="text-lg font-bold text-foreground">今日简报</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{dateStr}</span>
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
            {loading && !briefing && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground text-sm">正在生成简报...</span>
              </div>
            )}

            {error && !briefing && (
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

            {briefing && (
              <>
                {/* Greeting */}
                <p className="text-base text-foreground leading-relaxed">
                  {briefing.greeting}
                </p>

                {/* Priority Items */}
                {briefing.priority_items.length > 0 && (
                  <Section title="今日重点">
                    {briefing.priority_items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="text-primary font-medium text-sm mt-0.5">
                          {i + 1}.
                        </span>
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Unfinished */}
                {briefing.unfinished.length > 0 && (
                  <Section title="昨日未完成">
                    {briefing.unfinished.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <Circle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Relay Pending */}
                {briefing.relay_pending.length > 0 && (
                  <Section title="待转达">
                    {briefing.relay_pending.map((relay, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-2 py-1.5"
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <ArrowRight className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm text-foreground block">
                              {relay.context}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {relay.person}
                            </span>
                          </div>
                        </div>
                        {relay.todoId && (
                          <button
                            type="button"
                            onClick={() => handleRelayDone(relay.todoId)}
                            className="shrink-0 p-1 rounded hover:bg-secondary/60 transition-colors"
                            disabled={relayDone.has(relay.todoId)}
                          >
                            {relayDone.has(relay.todoId) ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </Section>
                )}

                {/* Followups */}
                {briefing.followups.length > 0 && (
                  <Section title="记忆提醒">
                    {briefing.followups.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="text-sm mt-0.5">💡</span>
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Stats */}
                <div className="bg-secondary/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">昨日统计</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-foreground">
                      ✅ {briefing.stats.yesterday_done}/{briefing.stats.yesterday_total} 完成
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">
                      连续记录 {briefing.stats.streak} 天
                    </span>
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
