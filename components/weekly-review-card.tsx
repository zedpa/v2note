"use client";

import { cn } from "@/lib/utils";
import type {
  WeeklyReview,
  WeeklyReviewStructuredData,
  ManagerWeeklyReviewDataA,
  ManagerWeeklyReviewDataB,
  CreatorWeeklyReviewData,
} from "@/lib/types";

interface WeeklyReviewCardProps {
  review: WeeklyReview;
}

function formatWeekRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getMonth() + 1}/${s.getDate()} — ${e.getMonth() + 1}/${e.getDate()}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold text-foreground mb-1.5">{children}</h4>;
}

function ItemList({ items, className }: { items: string[]; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((item, i) => (
        <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-1.5">
          <span className="text-muted-foreground/50 flex-shrink-0">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PillList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ManagerACard({ data }: { data: ManagerWeeklyReviewDataA }) {
  const s = data.sections;
  return (
    <div className="space-y-3">
      {/* Key events */}
      <div>
        <SectionTitle>重点事件</SectionTitle>
        {s.key_events.new_clients?.length > 0 && (
          <div className="mb-1.5">
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">新客户</p>
            <ItemList items={s.key_events.new_clients} />
          </div>
        )}
        {s.key_events.existing_clients?.length > 0 && (
          <div className="mb-1.5">
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">存量客户</p>
            <ItemList items={s.key_events.existing_clients} />
          </div>
        )}
        {s.key_events.market_actions?.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground/70 mb-0.5">市场动作</p>
            <ItemList items={s.key_events.market_actions} />
          </div>
        )}
      </div>

      {/* Impact factors */}
      <div className="grid grid-cols-2 gap-3">
        {s.impact_factors.positive?.length > 0 && (
          <div>
            <SectionTitle>正向因素</SectionTitle>
            <ItemList items={s.impact_factors.positive} />
          </div>
        )}
        {s.impact_factors.negative?.length > 0 && (
          <div>
            <SectionTitle>负向因素</SectionTitle>
            <ItemList items={s.impact_factors.negative} />
          </div>
        )}
      </div>

      {/* Warnings */}
      {s.warnings?.length > 0 && (
        <div>
          <SectionTitle>风险提醒</SectionTitle>
          <ItemList items={s.warnings} />
        </div>
      )}

      {/* Next week */}
      <div className="grid grid-cols-2 gap-3">
        {s.next_week_actions.continue?.length > 0 && (
          <div>
            <SectionTitle>继续保持</SectionTitle>
            <ItemList items={s.next_week_actions.continue} />
          </div>
        )}
        {s.next_week_actions.adjust?.length > 0 && (
          <div>
            <SectionTitle>需要调整</SectionTitle>
            <ItemList items={s.next_week_actions.adjust} />
          </div>
        )}
      </div>
    </div>
  );
}

function ManagerBCard({ data }: { data: ManagerWeeklyReviewDataB }) {
  const s = data.sections;
  return (
    <div className="space-y-3">
      {/* Team interactions */}
      <div className="grid grid-cols-2 gap-3">
        {s.team_interactions.outstanding?.length > 0 && (
          <div>
            <SectionTitle>表现突出</SectionTitle>
            <ItemList items={s.team_interactions.outstanding} />
          </div>
        )}
        {s.team_interactions.needs_attention?.length > 0 && (
          <div>
            <SectionTitle>需要关注</SectionTitle>
            <ItemList items={s.team_interactions.needs_attention} />
          </div>
        )}
      </div>

      {/* Recurring issues */}
      {s.recurring_issues?.length > 0 && (
        <div>
          <SectionTitle>反复问题</SectionTitle>
          <ItemList items={s.recurring_issues} />
        </div>
      )}

      {/* Management signals */}
      <div className="grid grid-cols-2 gap-3">
        {s.management_signals.frequently_mentioned?.length > 0 && (
          <div>
            <SectionTitle>频繁提及</SectionTitle>
            <ItemList items={s.management_signals.frequently_mentioned} />
          </div>
        )}
        {s.management_signals.ignored_risks?.length > 0 && (
          <div>
            <SectionTitle>忽略风险</SectionTitle>
            <ItemList items={s.management_signals.ignored_risks} />
          </div>
        )}
      </div>

      {/* Next week */}
      <div className="grid grid-cols-2 gap-3">
        {s.next_week_actions.one_on_one?.length > 0 && (
          <div>
            <SectionTitle>一对一沟通</SectionTitle>
            <ItemList items={s.next_week_actions.one_on_one} />
          </div>
        )}
        {s.next_week_actions.clarify_requirements?.length > 0 && (
          <div>
            <SectionTitle>明确要求</SectionTitle>
            <ItemList items={s.next_week_actions.clarify_requirements} />
          </div>
        )}
      </div>
    </div>
  );
}

function CreatorCard({ data }: { data: CreatorWeeklyReviewData }) {
  const s = data.sections;
  return (
    <div className="space-y-3">
      {/* Themes */}
      {s.themes?.length > 0 && (
        <div>
          <SectionTitle>本周主题</SectionTitle>
          <PillList items={s.themes} />
        </div>
      )}

      {/* Best ideas */}
      {s.best_ideas?.length > 0 && (
        <div>
          <SectionTitle>最佳灵感</SectionTitle>
          <ItemList items={s.best_ideas} />
        </div>
      )}

      {/* Connections */}
      {s.connections?.length > 0 && (
        <div>
          <SectionTitle>意外联系</SectionTitle>
          <ItemList items={s.connections} />
        </div>
      )}

      {/* Creative momentum */}
      {s.creative_momentum && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-[10px] text-muted-foreground mb-1">创作能量</p>
          <p className="text-sm font-medium text-foreground">{s.creative_momentum}</p>
        </div>
      )}

      {/* Next week focus */}
      {s.next_week_focus?.length > 0 && (
        <div>
          <SectionTitle>下周关注</SectionTitle>
          <PillList items={s.next_week_focus} />
        </div>
      )}
    </div>
  );
}

export function WeeklyReviewCard({ review }: WeeklyReviewCardProps) {
  const sd = review.structured_data as WeeklyReviewStructuredData | null;
  const weekRange = formatWeekRange(review.week_start, review.week_end);

  const stateLabel =
    sd?.state === "A"
      ? "指标压力型"
      : sd?.state === "B"
        ? "人员管理型"
        : sd?.state === "creator"
          ? "创作者周盘"
          : null;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{weekRange}</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {review.stats?.total_records != null && (
            <span>{review.stats.total_records} 笔记</span>
          )}
          {review.stats?.total_todos != null && (
            <span>{review.stats.completed_todos ?? 0}/{review.stats.total_todos} 待办</span>
          )}
        </div>
      </div>

      {/* State hint */}
      {stateLabel && (
        <p className="text-xs text-primary">
          本周管理重心偏向：<span className="font-semibold">{stateLabel}</span>
        </p>
      )}

      {/* Structured content or fallback */}
      {sd?.state === "A" ? (
        <ManagerACard data={sd as ManagerWeeklyReviewDataA} />
      ) : sd?.state === "B" ? (
        <ManagerBCard data={sd as ManagerWeeklyReviewDataB} />
      ) : sd?.state === "creator" ? (
        <CreatorCard data={sd as CreatorWeeklyReviewData} />
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {review.summary}
        </p>
      )}
    </div>
  );
}
