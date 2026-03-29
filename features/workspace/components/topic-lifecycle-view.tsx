"use client";

import { useState } from "react";
import { Check, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTopicLifecycle } from "../hooks/use-topic-lifecycle";
import { NowCard } from "@/features/action-panel/components/now-card";
import type { ActionCard } from "@/shared/lib/api/action-panel";

interface TopicLifecycleViewProps {
  clusterId: string;
  onOpenChat?: (msg: string) => void;
}

/**
 * 主题生命周期四阶段视图（"进展"标签页）
 * 此刻 → 正在长 → 种子 → 已收获
 */
export function TopicLifecycleView({
  clusterId,
  onOpenChat,
}: TopicLifecycleViewProps) {
  const { lifecycle, loading } = useTopicLifecycle(clusterId);
  const [expandedSeed, setExpandedSeed] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-surface-low animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!lifecycle) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="font-serif text-lg text-muted-accessible">
          暂无进展数据
        </p>
      </div>
    );
  }

  const { now, growing, seeds, harvest } = lifecycle;
  const hasNow = now.length > 0;
  const hasGrowing = growing.length > 0;
  const hasSeeds = seeds.length > 0;
  const hasHarvest = harvest.length > 0;

  if (!hasNow && !hasGrowing && !hasSeeds && !hasHarvest) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="font-serif text-lg text-muted-accessible">
          这个主题刚刚萌芽
        </p>
        <p className="text-sm text-muted-accessible mt-2">
          继续记录，进展会自然涌现
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* ── 此刻 ── Now ── */}
      {hasNow && (
        <section className="px-4 pt-4">
          <SectionHeader label="此刻" sub="Now" />

          {/* 第一条作为 NowCard 展示 */}
          {now[0] && !now[0].done && (
            <div className="mb-3">
              <NowCard
                card={todoToActionCard(now[0])}
                onComplete={() => {}}
                onSkip={() => {}}
              />
            </div>
          )}

          {/* 其余今日待办 */}
          {now.slice(1).map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 py-2.5 min-h-[40px]"
            >
              <span className="text-muted-accessible">
                {todo.done ? (
                  <div className="w-4 h-4 rounded-full flex items-center justify-center bg-deer/20">
                    <Check size={10} className="text-deer" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-accessible/40" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  todo.done
                    ? "line-through text-muted-accessible"
                    : "text-on-surface",
                )}
              >
                {todo.text}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ── 正在长 ── Growing ── */}
      {hasGrowing && (
        <section className="px-4 pt-6">
          <SectionHeader label="正在长" sub="Growing" />

          {growing.map((item) => (
            <div
              key={item.goal.id}
              className="mb-4 p-4 rounded-xl bg-surface-lowest shadow-ambient"
            >
              {/* 目标标题 + 进度 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <span className="text-sm font-medium text-on-surface">
                    {item.goal.title}
                  </span>
                </div>
                <span className="font-mono text-xs text-deer">
                  {item.completionPercent}%
                </span>
              </div>

              {/* 进度条 */}
              <div className="h-1 rounded-full bg-surface-high overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${item.completionPercent}%`,
                    background:
                      "linear-gradient(135deg, #89502C, #C8845C)",
                  }}
                />
              </div>

              {/* 待办列表 */}
              <div className="space-y-1.5">
                {item.todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-2.5 py-1"
                  >
                    {todo.done ? (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center bg-deer/20 shrink-0">
                        <Check size={10} className="text-deer" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-accessible/40 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm",
                        todo.done
                          ? "line-through text-muted-accessible"
                          : "text-on-surface",
                      )}
                    >
                      {todo.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── 种子 ── Seeds ── */}
      {hasSeeds && (
        <section className="px-4 pt-6">
          <SectionHeader label="种子" sub="Seeds" />

          {seeds.map((seed) => {
            const isExpanded = expandedSeed === seed.id;
            return (
              <div
                key={seed.id}
                className="mb-3 rounded-xl bg-surface-lowest shadow-ambient overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSeed(isExpanded ? null : seed.id)
                  }
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <span className="text-base shrink-0">💭</span>
                  <span className="flex-1 text-sm text-on-surface leading-snug">
                    &ldquo;{seed.nucleus}&rdquo;
                  </span>
                  {isExpanded ? (
                    <ChevronUp
                      size={14}
                      className="text-muted-accessible shrink-0"
                    />
                  ) : (
                    <ChevronDown
                      size={14}
                      className="text-muted-accessible shrink-0"
                    />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="flex items-center gap-2 text-xs text-muted-accessible mb-3">
                      <span className="font-mono">
                        {formatDate(seed.created_at)}
                      </span>
                      {seed.polarity && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-high">
                          {seed.polarity}
                        </span>
                      )}
                    </div>
                    {onOpenChat && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenChat(
                            `我想聊聊这个想法：${seed.nucleus}`,
                          )
                        }
                        className="flex items-center gap-1.5 text-xs text-deer hover:text-deer-dark transition-colors"
                      >
                        <MessageCircle size={12} />
                        和路路聊聊 →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ── 已收获 ── Harvest ── */}
      {hasHarvest && (
        <section className="px-4 pt-6">
          <SectionHeader label="已收获" sub="Harvest" />

          {harvest.map((item) => (
            <div
              key={item.goal.id}
              className="flex items-center gap-3 py-3"
            >
              <span className="text-base shrink-0">✦</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-on-surface">
                  {item.goal.title}
                </p>
                {item.reviewStrike && (
                  <p className="text-xs text-muted-accessible mt-0.5 truncate">
                    {item.reviewStrike.nucleus}
                  </p>
                )}
              </div>
              <span className="font-mono text-xs text-muted-accessible shrink-0">
                {formatDate(item.completedAt)}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/* ── 区段标题 ── */

function SectionHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="h-px flex-1 bg-surface-high" />
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-sm text-muted-accessible">
          {label}
        </span>
        <span className="font-serif text-[11px] tracking-widest uppercase text-muted-accessible/60">
          {sub}
        </span>
      </div>
      <div className="h-px flex-1 bg-surface-high" />
    </div>
  );
}

/* ── 辅助函数 ── */

/** 将 lifecycle 中的 todo 转换为 NowCard 所需的 ActionCard 格式 */
function todoToActionCard(todo: {
  id: string;
  text: string;
  done: boolean;
  scheduled_start?: string | null;
}): ActionCard {
  return {
    strikeId: todo.id,
    goalName: "",
    action: todo.text,
    actionType: "think",
    goalId: "",
  };
}

/** 日期格式化：近期显示相对时间，远期显示 MM-DD */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays < 7) return `${diffDays}天前`;

    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
}
