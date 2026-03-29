"use client";

import { Search, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "diary" | "todo";

export interface TopicFilter {
  clusterId: string;
  title: string;
}

export interface DimensionFilter {
  domain: string;
}

interface WorkspaceHeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onAvatarClick: () => void;
  onSearchClick: () => void;
  onNotificationClick: () => void;
  userName?: string | null;
  hasUnread?: boolean;
  topicFilter?: TopicFilter | null;
  onClearTopicFilter?: () => void;
  dimensionFilter?: DimensionFilter | null;
  onClearDimensionFilter?: () => void;
}

export function WorkspaceHeader({
  activeTab,
  onTabChange,
  onAvatarClick,
  onSearchClick,
  onNotificationClick,
  userName,
  hasUnread,
  topicFilter,
  onClearTopicFilter,
  dimensionFilter,
  onClearDimensionFilter,
}: WorkspaceHeaderProps) {
  const initial = userName?.charAt(0)?.toUpperCase() || "U";
  // 主题筛选态：Tab 文字变为 脉络|进展（spec 1.5）
  const leftLabel = topicFilter ? "脉络" : "日记";
  const rightLabel = topicFilter ? "进展" : "待办";

  return (
    <header
      className="sticky top-0 z-40 flex flex-col bg-surface/80 backdrop-blur-[12px]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between px-4 h-[44px]">
        {/* 左侧: 头像按钮 */}
        <button
          onClick={onAvatarClick}
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          aria-label="打开侧边栏"
        >
          {initial}
        </button>

        {/* 中间: Segment 切换器 */}
        <div className="flex items-center bg-surface-high rounded-full h-8 p-0.5 w-[160px]">
          <button
            onClick={() => onTabChange("diary")}
            className={cn(
              "flex-1 h-full rounded-full text-sm font-medium transition-all duration-200",
              activeTab === "diary"
                ? "bg-surface-lowest text-on-surface shadow-sm"
                : "text-muted-accessible",
            )}
          >
            {leftLabel}
          </button>
          <button
            onClick={() => onTabChange("todo")}
            className={cn(
              "flex-1 h-full rounded-full text-sm font-medium transition-all duration-200",
              activeTab === "todo"
                ? "bg-surface-lowest text-on-surface shadow-sm"
                : "text-muted-accessible",
            )}
          >
            {rightLabel}
          </button>
        </div>

        {/* 右侧: 搜索 + 通知 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onSearchClick}
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="搜索"
          >
            <Search size={18} />
          </button>
          <button
            onClick={onNotificationClick}
            className="relative w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="通知"
          >
            <Bell size={18} />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-maple" />
            )}
          </button>
        </div>
      </div>

      {/* 主题筛选药丸（spec 1.5） */}
      {topicFilter && (
        <div className="flex items-center px-4 pb-2">
          <button
            onClick={onClearTopicFilter}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest/10 text-forest text-xs font-medium transition-colors hover:bg-forest/15"
          >
            <span>🌿 {topicFilter.title}</span>
            <X size={12} />
          </button>
        </div>
      )}

      {/* 维度筛选药丸 */}
      {dimensionFilter && !topicFilter && (
        <div className="flex items-center px-4 pb-2">
          <button
            onClick={onClearDimensionFilter}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-deer/10 text-deer text-xs font-medium transition-colors hover:bg-deer/15"
          >
            <span>{dimensionFilter.domain}</span>
            <X size={12} />
          </button>
        </div>
      )}
    </header>
  );
}
