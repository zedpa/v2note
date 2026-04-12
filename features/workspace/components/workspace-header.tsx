"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "diary" | "todo";
export type TodoViewMode = "time" | "project";

interface WorkspaceHeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onAvatarClick: () => void;
  onChatClick?: () => void;
  onSearchClick: () => void;
  userName?: string | null;
  wikiPageFilter?: string | null;
  wikiPageFilterLabel?: string;
  onClearWikiPageFilter?: () => void;
  todoViewMode?: TodoViewMode;
  onTodoViewModeChange?: (mode: TodoViewMode) => void;
}

export function WorkspaceHeader({
  activeTab,
  onTabChange,
  onAvatarClick,
  onChatClick,
  onSearchClick,
  userName,
  wikiPageFilter,
  wikiPageFilterLabel,
  onClearWikiPageFilter,
  todoViewMode = "time",
  onTodoViewModeChange,
}: WorkspaceHeaderProps) {
  const initial = userName?.charAt(0)?.toUpperCase() || "U";
  const [showViewMenu, setShowViewMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showViewMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [showViewMenu]);

  return (
    <header
      className="sticky top-0 z-40 flex flex-col bg-surface/80 backdrop-blur-[12px]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between px-4 h-[44px]">
        {/* 左侧: 头像按钮 */}
        <button
          onClick={onAvatarClick}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
          aria-label="打开侧边栏"
        >
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white"
            style={{ background: "linear-gradient(135deg, var(--avatar-gradient-from), var(--avatar-gradient-to))" }}
          >
            {initial}
          </span>
        </button>

        {/* 中间: Segment 切换器 */}
        <div role="tablist" aria-label="主视图切换" className="flex items-center bg-surface-high rounded-full min-h-[48px] p-0.5 w-[160px] shrink-0">
          <div role="presentation" className="flex-1 min-w-0 h-full">
            <button
              role="tab"
              aria-selected={activeTab === "diary"}
              onClick={() => onTabChange("diary")}
              className={cn(
                "w-full h-full rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center py-2 px-4 whitespace-nowrap",
                activeTab === "diary"
                  ? "bg-surface-lowest text-on-surface shadow-sm"
                  : "text-muted-accessible",
              )}
            >
              日记
            </button>
          </div>
          <div role="presentation" className="flex-1 min-w-0 h-full relative" ref={menuRef}>
            <button
              role="tab"
              data-guide="tab-todo"
              aria-selected={activeTab === "todo"}
              onClick={() => {
                if (activeTab === "todo") {
                  setShowViewMenu((v) => !v);
                } else {
                  onTabChange("todo");
                }
              }}
              className={cn(
                "w-full h-full rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-0.5 py-2 px-4 whitespace-nowrap",
                activeTab === "todo"
                  ? "bg-surface-lowest text-on-surface shadow-sm"
                  : "text-muted-accessible",
              )}
            >
              待办
              {activeTab === "todo" && (
                <ChevronDown size={12} className={cn("transition-transform duration-200", showViewMenu && "rotate-180")} />
              )}
            </button>
            {/* 视图选择下拉菜单 */}
            {showViewMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-28 bg-background border border-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => { onTodoViewModeChange?.("time"); setShowViewMenu(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left transition-colors",
                    todoViewMode === "time" ? "text-primary font-medium" : "text-foreground hover:bg-secondary/60",
                  )}
                >
                  日期视图
                </button>
                <button
                  type="button"
                  onClick={() => { onTodoViewModeChange?.("project"); setShowViewMenu(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left transition-colors",
                    todoViewMode === "project" ? "text-primary font-medium" : "text-foreground hover:bg-secondary/60",
                  )}
                >
                  项目视图
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 右侧: AI聊天 + 搜索 */}
        <div className="flex items-center gap-2 shrink-0">
          {onChatClick && (
            <button
              onClick={onChatClick}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-deer hover:text-deer/80 transition-colors"
              aria-label="AI 聊天"
            >
              <MessageCircle size={18} />
            </button>
          )}
          <button
            onClick={onSearchClick}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="搜索"
          >
            <Search size={18} />
          </button>
        </div>
      </div>

      {/* 主题筛选药丸 */}
      {wikiPageFilter && (
        <div className="flex items-center px-4 pb-2">
          <button
            onClick={onClearWikiPageFilter}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-deer/10 text-deer text-xs font-medium transition-colors hover:bg-deer/15"
          >
            <span>{wikiPageFilterLabel || "筛选中"}</span>
            <X size={12} />
          </button>
        </div>
      )}

    </header>
  );
}
