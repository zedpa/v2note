"use client";

import { useState, useEffect } from "react";
import {
  X, Search, Sun, Compass, BarChart3, Target,
  FolderOpen, Lightbulb, Sparkles, Settings, LogOut, Plus, ChevronDown, ChevronRight,
} from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { cn } from "@/lib/utils";
import { listGoals } from "@/shared/lib/api/goals";
import type { Goal } from "@/shared/lib/types";

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewStats?: () => void;
  onViewMemory?: () => void;
  onViewProfile?: () => void;
  onViewBriefing?: () => void;
  onViewSettings?: () => void;
  onViewSkills?: () => void;
  onViewReview?: () => void;
  onViewSearch?: () => void;
  onViewGoal?: (goalId: string) => void;
  onViewGoals?: () => void;
  onLogout?: () => void;
  userName?: string | null;
  userPhone?: string | null;
}

export function SidebarDrawer({
  open,
  onClose,
  onViewStats,
  onViewMemory,
  onViewProfile,
  onViewBriefing,
  onViewSettings,
  onViewSkills,
  onViewReview,
  onViewSearch,
  onViewGoal,
  onViewGoals,
  onLogout,
  userName,
  userPhone,
}: SidebarDrawerProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsExpanded, setGoalsExpanded] = useState(true);

  // 加载目标列表
  useEffect(() => {
    if (!open) return;
    listGoals()
      .then((g) => setGoals(g || []))
      .catch(() => {});
  }, [open]);

  const initial = userName?.charAt(0)?.toUpperCase() || "U";

  // 按 parent_id 分组: 有 parent_id 的是子目标，parent_id=null 的是顶层
  const topGoals = goals.filter((g) => !g.parent_id && g.status === "active");
  const projectGoals = goals.filter((g) => g.parent_id && g.status === "active");

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

          {/* ── 第一组: 浏览 ── */}
          <nav className="space-y-1">
            {onViewSearch && (
              <SidebarItem
                icon={<Search size={18} />}
                label="搜索"
                onClick={() => { onClose(); onViewSearch(); }}
              />
            )}
            {onViewReview && (
              <SidebarItem
                icon={<Sun size={18} />}
                label="每日回顾"
                onClick={() => { onClose(); onViewReview(); }}
              />
            )}
            {onViewBriefing && (
              <SidebarItem
                icon={<Sun size={18} />}
                label="今日简报"
                onClick={() => { onClose(); onViewBriefing(); }}
              />
            )}
            <SidebarItem
              icon={<Compass size={18} />}
              label="发现"
              onClick={() => { onClose(); /* TODO: cognitive map overlay */ }}
            />
            {onViewStats && (
              <SidebarItem
                icon={<BarChart3 size={18} />}
                label="认知统计"
                onClick={() => { onClose(); onViewStats(); }}
              />
            )}
          </nav>

          {/* ── spacing-6 分组间距 ── */}
          <div className="h-8" />

          {/* ── 第二组: 我的目标 ── */}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    onViewGoals?.();
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
                  aria-label="新建目标"
                >
                  <Plus size={14} />
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
                {topGoals.length === 0 && projectGoals.length === 0 && (
                  <p className="text-xs text-muted-accessible px-3 py-2">
                    暂无目标，对路路说说你的想法
                  </p>
                )}
                {topGoals.map((goal) => {
                  const childCount = projectGoals.filter(
                    (g) => g.parent_id === goal.id,
                  ).length;
                  return (
                    <SidebarItem
                      key={goal.id}
                      icon={<FolderOpen size={18} />}
                      label={goal.title}
                      badge={childCount > 0 ? String(childCount) : undefined}
                      onClick={() => {
                        onClose();
                        onViewGoal?.(goal.id);
                      }}
                    />
                  );
                })}
                {/* 独立目标（无子目标，也无 parent） */}
                {goals
                  .filter(
                    (g) =>
                      !g.parent_id &&
                      g.status === "active" &&
                      !projectGoals.some((p) => p.parent_id === g.id),
                  )
                  .filter((g) => !topGoals.some((t) => t.id === g.id && projectGoals.some((p) => p.parent_id === t.id)))
                  .map((goal) => (
                    <SidebarItem
                      key={`ind-${goal.id}`}
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

          {/* ── spacing-6 分组间距 ── */}
          <div className="h-8" />

          {/* ── 第三组: 配置 ── */}
          <nav className="space-y-1">
            {onViewSkills && (
              <SidebarItem
                icon={<Sparkles size={18} />}
                label="洞察视角"
                onClick={() => { onClose(); onViewSkills(); }}
              />
            )}
            {onViewProfile && (
              <SidebarItem
                icon={<LuluLogo size={18} variant="color" className="animate-none" />}
                label="路路设置"
                onClick={() => { onClose(); onViewProfile(); }}
              />
            )}
            {onViewMemory && (
              <SidebarItem
                icon={<Lightbulb size={18} />}
                label="AI 记忆"
                onClick={() => { onClose(); onViewMemory(); }}
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

          {/* ── spacing-6 分组间距 ── */}
          <div className="h-8" />

          {/* 退出登录 */}
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
    </>
  );
}

/* ── 侧边栏菜单项 ── */

function SidebarItem({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors"
    >
      <span className="text-muted-accessible shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-on-surface truncate">{label}</span>
      {badge && (
        <span className="text-xs font-mono text-muted-accessible">{badge}</span>
      )}
    </button>
  );
}
