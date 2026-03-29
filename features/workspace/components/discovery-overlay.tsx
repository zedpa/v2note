"use client";

import { useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTopics } from "../hooks/use-topics";
import type { TopicItem } from "@/shared/lib/api/topics";

type FilterType = "all" | "active" | "silent" | "seed";

interface DiscoveryOverlayProps {
  onClose: () => void;
  onOpenTopic: (clusterId: string) => void;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "活跃" },
  { key: "silent", label: "静默" },
  { key: "seed", label: "种子" },
];

/**
 * 发现页 overlay — 展示从 Strike 中涌现的 Topic
 */
export function DiscoveryOverlay({ onClose, onOpenTopic }: DiscoveryOverlayProps) {
  const { topics, active, independent, silent, loading } = useTopics();
  const [filter, setFilter] = useState<FilterType>("all");

  // 按筛选条件过滤
  const filtered = (() => {
    switch (filter) {
      case "active": return active;
      case "silent": return silent;
      case "seed": return independent;
      default: return topics;
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-surface-lowest overflow-y-auto">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 bg-surface-lowest/90 backdrop-blur-md border-b border-surface-high">
        <div className="flex items-center gap-3 px-4 h-12">
          <button type="button" onClick={onClose} className="p-1 -ml-1 text-muted-accessible">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-serif text-lg text-on-surface">发现</h1>
        </div>

        {/* 筛选药丸 */}
        <div className="flex gap-2 px-4 pb-3">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs transition-colors",
                filter === key
                  ? "bg-deer text-white"
                  : "bg-surface-high text-muted-accessible hover:bg-surface-low",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* 内容 */}
      <div className="p-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-surface-low animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Sparkles size={32} className="text-deer/40 mb-4" />
            <p className="font-serif text-lg text-muted-accessible">
              继续记录，AI 会帮你发现你在关注什么
            </p>
            <p className="text-sm text-muted-accessible/70 mt-2">
              每一次记录都是认知的种子
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(topic => (
              <TopicCard
                key={topic.clusterId}
                topic={topic}
                onClick={() => onOpenTopic(topic.clusterId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 方向卡片 ── */

function TopicCard({ topic, onClick }: { topic: TopicItem; onClick: () => void }) {
  const daysSinceActivity = Math.floor(
    (Date.now() - new Date(topic.lastActivity).getTime()) / (1000 * 60 * 60 * 24),
  );
  const activityLabel = daysSinceActivity === 0 ? "今天" :
    daysSinceActivity === 1 ? "昨天" :
    daysSinceActivity < 7 ? `${daysSinceActivity}天前` :
    `${Math.floor(daysSinceActivity / 7)}周前`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl shadow-ambient transition-colors",
        topic.hasActiveGoal
          ? "bg-surface-lowest border border-deer/20"
          : "bg-surface-lowest border border-surface-high",
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-on-surface">{topic.title}</h3>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full",
          topic.hasActiveGoal ? "bg-deer/10 text-deer" : "bg-surface-high text-muted-accessible",
        )}>
          {topic.hasActiveGoal ? "活跃" : topic.memberCount >= 3 ? "静默" : "种子"}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-accessible">
        <span>{topic.memberCount} 条记录</span>
        <span>·</span>
        <span>{activityLabel}活动</span>
      </div>

      {/* 活跃目标 */}
      {topic.activeGoals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topic.activeGoals.map(g => (
            <span key={g.id} className="text-xs px-2 py-0.5 rounded-md bg-deer/5 text-deer">
              {g.title}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
