"use client";

import { Search, User, Sparkles, ListChecks, BookOpen } from "lucide-react";

interface NewHeaderProps {
  onSearchClick: () => void;
  onAvatarClick: () => void;
  onInsightClick: () => void;
  onTodosClick: () => void;
  onNotebookClick?: () => void;
  activeNotebookName?: string | null;
  activeNotebookColor?: string | null;
}

export function NewHeader({
  onSearchClick,
  onAvatarClick,
  onInsightClick,
  onTodosClick,
  onNotebookClick,
  activeNotebookName,
  activeNotebookColor,
}: NewHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl pt-safe">
      <div className="flex items-center justify-between px-4 pt-1 pb-3">
        {/* Left side — avatar + insight + notebook */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAvatarClick}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0"
            aria-label="个人中心"
          >
            <User className="w-5 h-5 text-primary" />
          </button>

          <button
            type="button"
            onClick={onInsightClick}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary/60 hover:bg-secondary transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">洞察</span>
          </button>

          {onNotebookClick && (
            <button
              type="button"
              onClick={onNotebookClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 hover:bg-secondary transition-colors"
            >
              {activeNotebookName ? (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeNotebookColor || "#6366f1" }}
                  />
                  <span className="text-xs font-medium text-foreground max-w-[5rem] truncate">
                    {activeNotebookName}
                  </span>
                </>
              ) : (
                <>
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">笔记本</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right side — search + todo */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSearchClick}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary/70 hover:bg-secondary transition-colors"
            aria-label="搜索"
          >
            <Search className="w-4.5 h-4.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={onTodosClick}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-r from-primary/15 to-accent/10 hover:from-primary/25 hover:to-accent/15 transition-all border border-primary/10"
          >
            <ListChecks className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-semibold text-primary">待办</span>
          </button>
        </div>
      </div>
      {/* Subtle bottom gradient border */}
      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </header>
  );
}
