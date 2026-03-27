"use client";

import { Search, Bell } from "lucide-react";

export type WorkspaceTab = "diary" | "todo";

interface WorkspaceHeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onAvatarClick: () => void;
  onSearchClick: () => void;
  onNotificationClick: () => void;
  userName?: string | null;
  hasUnread?: boolean;
}

export function WorkspaceHeader({
  activeTab,
  onTabChange,
  onAvatarClick,
  onSearchClick,
  onNotificationClick,
  userName,
  hasUnread,
}: WorkspaceHeaderProps) {
  const initial = userName?.charAt(0)?.toUpperCase() || "U";

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 h-[44px] bg-surface/80 backdrop-blur-[12px]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
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
          className={`flex-1 h-full rounded-full text-sm font-medium transition-all duration-200 ${
            activeTab === "diary"
              ? "bg-surface-lowest text-on-surface shadow-sm"
              : "text-muted-accessible"
          }`}
        >
          日记
        </button>
        <button
          onClick={() => onTabChange("todo")}
          className={`flex-1 h-full rounded-full text-sm font-medium transition-all duration-200 ${
            activeTab === "todo"
              ? "bg-surface-lowest text-on-surface shadow-sm"
              : "text-muted-accessible"
          }`}
        >
          待办
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
    </header>
  );
}
