"use client";

import { Search, User } from "lucide-react";

interface NewHeaderProps {
  onSearchClick: () => void;
  onAvatarClick: () => void;
}

export function NewHeader({
  onSearchClick,
  onAvatarClick,
}: NewHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl pt-safe">
      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
        {/* Avatar — left side */}
        <button
          type="button"
          onClick={onAvatarClick}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0"
          aria-label="个人中心"
        >
          <User className="w-5 h-5 text-primary" />
        </button>

        {/* Search bar — right side */}
        <button
          type="button"
          onClick={onSearchClick}
          className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-secondary/70 hover:bg-secondary transition-colors text-left"
        >
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">搜索笔记...</span>
        </button>
      </div>
    </header>
  );
}
