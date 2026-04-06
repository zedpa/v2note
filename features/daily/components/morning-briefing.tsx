"use client";

import { SwipeBack } from "@/shared/components/swipe-back";
import { Loader2, RefreshCw, Clock } from "lucide-react";
import { useDailyBriefing } from "../hooks/use-daily-briefing";
import { cn } from "@/lib/utils";

interface MorningBriefingProps {
  onClose: () => void;
}

export function MorningBriefing({ onClose }: MorningBriefingProps) {
  const { briefing, loading, error, refresh } = useDailyBriefing();

  const now = new Date();
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-surface pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur-[12px]">
          <h1 className="text-lg font-serif text-on-surface">今日简报</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{dateStr}</span>
            <button
              type="button"
              onClick={() => refresh(true)}
              className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loading && "animate-spin")} />
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

        {/* Loading / Error */}
        {loading && !briefing && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground text-sm">正在生成简报...</span>
          </div>
        )}

        {error && !briefing && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <p>加载失败: {error}</p>
              <button type="button" onClick={() => refresh()} className="mt-2 text-primary underline">重试</button>
            </div>
          </div>
        )}

        {/* 内容 */}
        {briefing && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* 问候 */}
            <p className="font-serif text-2xl text-on-surface leading-relaxed">
              {briefing.greeting}
            </p>

            {/* 今日重点 */}
            {briefing.today_focus.length > 0 && (
              <Section title="今日重点">
                {briefing.today_focus.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <span className="text-primary font-medium text-sm mt-0.5">
                      {i + 1}.
                    </span>
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* 遗留事项 */}
            {briefing.carry_over.length > 0 && (
              <Section title="遗留事项">
                {briefing.carry_over.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <Clock className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* 昨日统计 */}
            <div className="bg-surface-low rounded-lg px-4 py-3">
              <p className="text-xs text-muted-accessible mb-1">昨日统计</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-on-surface">
                  {briefing.stats.yesterday_done}/{briefing.stats.yesterday_total} 完成
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              开始今天
            </button>
          </div>
        )}
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
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  );
}
