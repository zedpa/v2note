"use client";

import { SwipeBack } from "@/shared/components/swipe-back";
import { Loader2, Circle, ArrowRight, RefreshCw, Target, Sparkles, Clock } from "lucide-react";
import { useDailyBriefing, markRelayDone } from "../hooks/use-daily-briefing";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface MorningBriefingProps {
  onClose: () => void;
}

export function MorningBriefing({ onClose }: MorningBriefingProps) {
  const { briefing, loading, error, refresh } = useDailyBriefing();
  const [relayDone, setRelayDone] = useState<Set<string>>(new Set());
  const [currentCard, setCurrentCard] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

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

  // 构建卡片列表（只包含有数据的卡片）
  const cards: Array<{ key: string; title: string; content: React.ReactNode }> = [];

  if (briefing) {
    // 卡片 1: 问候 + 今日重点
    cards.push({
      key: "greeting",
      title: "今日简报",
      content: (
        <div className="space-y-5">
          <p className="font-serif text-2xl text-on-surface leading-relaxed">
            {briefing.greeting}
          </p>
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
        </div>
      ),
    });

    // 卡片 2: 目标进度 + 遗留事项（有数据才显示）
    const hasGoals = briefing.goal_progress.length > 0;
    const hasCarryOver = briefing.carry_over.length > 0;
    const hasRelays = briefing.relay_pending.length > 0;
    if (hasGoals || hasCarryOver || hasRelays) {
      cards.push({
        key: "goals",
        title: "进展 & 遗留",
        content: (
          <div className="space-y-5">
            {hasGoals && (
              <Section title="目标进度">
                {briefing.goal_progress.map((goal, i) => (
                  <div key={i} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm font-medium text-on-surface">
                        {goal.title}
                      </span>
                      <span className="text-xs text-muted-accessible">
                        {goal.pending_count}项待办
                      </span>
                    </div>
                    {goal.today_todos.length > 0 && (
                      <div className="ml-5 mt-0.5">
                        {goal.today_todos.map((todo, j) => (
                          <span key={j} className="text-xs text-muted-foreground">
                            {j > 0 ? "、" : ""}{todo}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}
            {hasCarryOver && (
              <Section title="遗留事项">
                {briefing.carry_over.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <Clock className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}
            {hasRelays && (
              <Section title="待转达">
                {briefing.relay_pending.map((relay, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 py-1.5">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm text-on-surface block">{relay.context}</span>
                        <span className="text-xs text-muted-accessible">{relay.person}</span>
                      </div>
                    </div>
                    {relay.todoId && (
                      <button
                        type="button"
                        onClick={() => handleRelayDone(relay.todoId)}
                        className="shrink-0 p-1 rounded hover:bg-secondary/60 transition-colors"
                        disabled={relayDone.has(relay.todoId)}
                      >
                        <Circle className={cn("w-4 h-4", relayDone.has(relay.todoId) ? "text-green-500" : "text-muted-foreground")} />
                      </button>
                    )}
                  </div>
                ))}
              </Section>
            )}
          </div>
        ),
      });
    }

    // 卡片 3: AI 建议 + 统计 + 开始今天
    cards.push({
      key: "stats",
      title: "准备出发",
      content: (
        <div className="space-y-5">
          {briefing.ai_suggestions.length > 0 && (
            <Section title="AI 建议">
              {briefing.ai_suggestions.map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-on-surface">{item}</span>
                </div>
              ))}
            </Section>
          )}
          <div className="bg-surface-low rounded-lg px-4 py-3">
            <p className="text-xs text-muted-accessible mb-1">昨日统计</p>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-on-surface">
                {briefing.stats.yesterday_done}/{briefing.stats.yesterday_total} 完成
              </span>
              <span className="text-muted-accessible">·</span>
              <span className="text-on-surface">
                连续记录 {briefing.stats.streak} 天
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-medium text-white transition-opacity"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            开始今天
          </button>
        </div>
      ),
    });
  }

  const totalCards = cards.length;

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

        {/* 卡片横滑区 */}
        {briefing && totalCards > 0 && (
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
                {cards.map((card) => (
                  <div key={card.key} className="w-full shrink-0 px-5 overflow-y-auto">
                    <div className="pb-8">
                      {card.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
