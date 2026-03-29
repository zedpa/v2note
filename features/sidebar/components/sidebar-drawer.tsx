"use client";

import { useState, useEffect } from "react";
import {
  X, Zap, Compass, Target, Settings, LogOut,
  ChevronDown, ChevronRight, TreePine, CalendarDays,
  Briefcase, Home, BookOpen, Heart, Users, Coins, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listGoals, listDimensions, type DimensionSummary } from "@/shared/lib/api/goals";
import type { Goal } from "@/shared/lib/types";

/** 维度 → 图标映射 */
const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  "工作": <Briefcase size={18} />,
  "生活": <Home size={18} />,
  "学习": <BookOpen size={18} />,
  "健康": <Heart size={18} />,
  "社交": <Users size={18} />,
  "投资": <Coins size={18} />,
};

function getDomainIcon(domain: string) {
  return DOMAIN_ICONS[domain] ?? <Sparkles size={18} />;
}

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewBriefing?: () => void;
  onViewEvening?: () => void;
  onViewSettings?: () => void;
  onViewReview?: () => void;
  onViewSearch?: () => void;
  onViewGoal?: (goalId: string) => void;
  onViewGoals?: () => void;
  onViewDiscovery?: () => void;
  onSelectDimension?: (domain: string) => void;
  onSelectToday?: () => void;
  onLogout?: () => void;
  userName?: string | null;
  userPhone?: string | null;
  activeDimension?: string | null;
  // 保留但不在设计图中显示的回调
  onViewStats?: () => void;
  onViewMemory?: () => void;
  onViewProfile?: () => void;
  onViewSkills?: () => void;
  onSelectTopic?: (clusterId: string, title: string) => void;
  onOpenChat?: (initialMsg: string) => void;
}

export function SidebarDrawer({
  open,
  onClose,
  onViewBriefing,
  onViewEvening,
  onViewSettings,
  onViewReview,
  onViewSearch,
  onViewGoal,
  onViewGoals,
  onViewDiscovery,
  onSelectDimension,
  onSelectToday,
  onLogout,
  userName,
  userPhone,
  activeDimension,
  onViewStats,
  onViewMemory,
  onViewProfile,
  onViewSkills,
  onSelectTopic,
  onOpenChat,
}: SidebarDrawerProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set());
  const [goalsExpanded, setGoalsExpanded] = useState(true);

  // 加载目标列表 + 维度统计
  useEffect(() => {
    if (!open) return;
    listGoals()
      .then((g) => setGoals(g || []))
      .catch(() => {});
    listDimensions()
      .then((d) => setDimensions(d || []))
      .catch(() => {});
  }, [open]);

  const initial = userName?.charAt(0)?.toUpperCase() || "U";

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 flex flex-col",
          "w-[75vw] max-w-[320px]",
          "bg-surface-high",
          "animate-in slide-in-from-left duration-200",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* 头部: 头像 + 用户名 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              {initial}
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface">
                {userName || "VoiceNote"}
              </p>
              <p className="text-xs text-muted-accessible">
                {userPhone || "AI 个人助手"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="关闭侧边栏"
          >
            <X size={16} />
          </button>
        </div>

        {/* 滚动内容 */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── 第一组: 导航 ── */}
          <nav className="space-y-0.5">
            <SidebarItem
              icon={<Zap size={18} />}
              label="今日"
              onClick={() => {
                onClose();
                onSelectToday?.();
              }}
            />
            <SidebarItem
              icon={<Compass size={18} />}
              label="发现"
              onClick={() => { onClose(); onViewDiscovery?.(); }}
            />
          </nav>

          {/* ── 分隔 + 我的世界 ── */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted-accessible tracking-widest">我的世界</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          {/* ── 维度列表 ── */}
          {dimensions.length > 0 ? (
            <nav className="space-y-0.5">
              {dimensions.map((dim) => {
                const isExpanded = expandedDimensions.has(dim.domain);
                const isActive = activeDimension === dim.domain;
                // 该维度下的目标：按 domain 严格匹配
                const dimGoals = goals.filter(
                  (g) =>
                    (g as any).domain === dim.domain &&
                    (g.status === "active" || g.status === "progressing"),
                );
                const totalCount = dim.pending_count + dim.goal_count;

                return (
                  <div key={dim.domain}>
                    {/* 维度行 */}
                    <div
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors",
                        isActive
                          ? "bg-deer/10"
                          : "hover:bg-surface/60 active:bg-surface/80",
                      )}
                    >
                      {/* 图标 + 名称：点击 = 全局筛选 */}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectDimension?.(dim.domain);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <span className={cn("shrink-0", isActive ? "text-deer" : "text-muted-accessible")}>
                          {getDomainIcon(dim.domain)}
                        </span>
                        <span className={cn("text-sm flex-1 truncate", isActive ? "text-deer font-medium" : "text-on-surface")}>
                          {dim.domain}
                        </span>
                      </button>

                      {/* 计数 */}
                      <span className="text-xs text-muted-accessible">
                        ({totalCount})
                      </span>

                      {/* 展开/收起箭头 */}
                      {dimGoals.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDimensions((prev) => {
                              const next = new Set(prev);
                              next.has(dim.domain) ? next.delete(dim.domain) : next.add(dim.domain);
                              return next;
                            });
                          }}
                          className="p-1 rounded-md hover:bg-surface/80 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} className="text-muted-accessible" />
                          ) : (
                            <ChevronRight size={14} className="text-muted-accessible" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* 展开后显示该维度下的目标 */}
                    {isExpanded && dimGoals.length > 0 && (
                      <nav className="pl-8 space-y-0.5">
                        {dimGoals.slice(0, 8).map((goal) => (
                          <SidebarItem
                            key={goal.id}
                            icon={goal.cluster_id ? <TreePine size={16} /> : <Target size={16} />}
                            label={goal.title}
                            badge={
                              (goal as any).child_count > 0
                                ? `(${(goal as any).child_count})`
                                : undefined
                            }
                            onClick={() => {
                              onClose();
                              onViewGoal?.(goal.id);
                            }}
                          />
                        ))}
                      </nav>
                    )}
                  </div>
                );
              })}
            </nav>
          ) : (
            /* 无维度时回退到原有的目标列表 */
            <div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setGoalsExpanded(!goalsExpanded)}
                onKeyDown={(e) => e.key === "Enter" && setGoalsExpanded(!goalsExpanded)}
                className="flex items-center justify-between w-full mb-2 cursor-pointer"
              >
                <span className="font-serif text-sm text-on-surface">我的目标</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      onViewGoals?.();
                    }}
                    className="text-[10px] text-muted-accessible hover:text-deer transition-colors"
                  >
                    查看全部
                  </button>
                  {goalsExpanded ? (
                    <ChevronDown size={14} className="text-muted-accessible" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-accessible" />
                  )}
                </div>
              </div>

              {goalsExpanded && (
                <nav className="space-y-1">
                  {goals.length === 0 && (
                    <p className="text-xs text-muted-accessible px-3 py-2">
                      持续记录后，AI 会发现你的关注方向
                    </p>
                  )}
                  {goals
                    .filter((g) => g.status === "active" && !g.parent_id)
                    .slice(0, 10)
                    .map((goal) => (
                      <SidebarItem
                        key={goal.id}
                        icon={<Target size={18} />}
                        label={goal.title}
                        onClick={() => {
                          onClose();
                          onViewGoal?.(goal.id);
                        }}
                      />
                    ))}
                </nav>
              )}
            </div>
          )}

          {/* ── 分隔线 ── */}
          <div className="my-5 h-px bg-border/40" />

          {/* ── 第三组: 每日回顾 + 设置 ── */}
          <nav className="space-y-0.5">
            {(onViewBriefing || onViewEvening) && (
              <SidebarItem
                icon={<CalendarDays size={18} />}
                label="每日回顾"
                showDot
                onClick={() => {
                  onClose();
                  const hour = new Date().getHours();
                  if (hour >= 18 && onViewEvening) {
                    onViewEvening();
                  } else if (onViewBriefing) {
                    onViewBriefing();
                  } else {
                    onViewEvening?.();
                  }
                }}
              />
            )}
            {onViewSettings && (
              <SidebarItem
                icon={<Settings size={18} />}
                label="设置"
                onClick={() => { onClose(); onViewSettings(); }}
              />
            )}
          </nav>

          {/* ── 退出登录 ── */}
          <div className="mt-5">
            {onLogout && (
              <button
                type="button"
                onClick={() => { onClose(); onLogout(); }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-accessible hover:text-maple transition-colors"
              >
                <LogOut size={16} />
                退出登录
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── 侧边栏菜单项 ── */

function SidebarItem({
  icon,
  label,
  badge,
  sublabel,
  showDot,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  sublabel?: string;
  showDot?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors"
    >
      <span className="text-muted-accessible shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-on-surface truncate block">{label}</span>
        {sublabel && (
          <span className="text-[10px] text-muted-accessible truncate block">{sublabel}</span>
        )}
      </div>
      {badge && (
        <span className="text-xs font-mono text-muted-accessible">{badge}</span>
      )}
      {showDot && (
        <span className="w-2 h-2 rounded-full bg-maple shrink-0" />
      )}
    </button>
  );
}
