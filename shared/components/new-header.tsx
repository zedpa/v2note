"use client";

import { Search, User, BarChart3, ListChecks, AlignLeft } from "lucide-react";

interface NewHeaderProps {
  onSearchClick: () => void;
  onAvatarClick: () => void;
  onInsightClick: () => void;
  onTodosClick: () => void;
  onNotebookClick?: () => void;
  activeNotebookName?: string | null;
  activeNotebookColor?: string | null;
  userName?: string | null;
}

export function NewHeader({
  onSearchClick,
  onAvatarClick,
  onInsightClick,
  onTodosClick,
  onNotebookClick,
  activeNotebookName,
  activeNotebookColor,
  userName,
}: NewHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl pt-safe">
      <div className="flex items-center justify-between px-4 pt-1 pb-3">
        {/* Left — avatar */}
        <button
          type="button"
          onClick={onAvatarClick}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground flex-shrink-0 shadow-sm"
          aria-label="个人中心"
        >
          {userName ? (
            <span className="text-sm font-bold">{userName.charAt(0)}</span>
          ) : (
            <User className="w-5 h-5" />
          )}
        </button>

        {/* Center — insight + notebook pills */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onInsightClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary/80 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">洞察</span>
          </button>

          {onNotebookClick && (
            <button
              type="button"
              onClick={onNotebookClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              {activeNotebookName ? (
                <>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: activeNotebookColor || "#fff" }}
                  />
                  <span className="text-xs font-medium max-w-[5rem] truncate">
                    {activeNotebookName}
                  </span>
                </>
              ) : (
                <>
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">笔记本</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right — search + todo */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSearchClick}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary/60 transition-colors"
            aria-label="搜索"
          >
            <Search className="w-[18px] h-[18px] text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={onTodosClick}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
          >
            <ListChecks className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">待办</span>
          </button>
        </div>
      </div>
    </header>
  );
}
