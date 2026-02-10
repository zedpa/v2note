"use client";

import { Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewHeaderProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onSearchClick: () => void;
  onAvatarClick: () => void;
  tags: string[];
}

export function NewHeader({
  activeFilter,
  onFilterChange,
  onSearchClick,
  onAvatarClick,
  tags,
}: NewHeaderProps) {
  // Fixed pills: 全部, 待办, 灵感 + dynamic tags (deduplicated)
  const fixedFilters = ["全部", "待办", "灵感"];
  const dynamicTags = tags.filter((t) => !fixedFilters.includes(t));
  const filters = [...fixedFilters, ...dynamicTags];

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {/* Search bar */}
        <button
          type="button"
          onClick={onSearchClick}
          className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-secondary/70 hover:bg-secondary transition-colors text-left"
        >
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">搜索笔记...</span>
        </button>

        {/* Avatar */}
        <button
          type="button"
          onClick={onAvatarClick}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0"
          aria-label="个人中心"
        >
          <User className="w-5 h-5 text-primary" />
        </button>
      </div>

      {/* Tag filter pills */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
        {filters.map((filter) => (
          <button
            type="button"
            key={filter}
            onClick={() => onFilterChange(filter)}
            className={cn(
              "flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
              activeFilter === filter
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
            )}
          >
            {filter}
          </button>
        ))}
      </div>
    </header>
  );
}
