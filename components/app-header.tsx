"use client";

import { Search, Mic } from "lucide-react";
import type { TabKey } from "./bottom-nav";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  activeTab: TabKey;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onSearchClick?: () => void;
}

const TITLES: Record<TabKey, string> = {
  notes: "VoiceNote",
  todos: "待办事项",
  profile: "我的",
};

const FILTERS = ["全部", "待办", "工作", "学习", "个人", "想法", "健康"];

export function AppHeader({ activeTab, activeFilter, onFilterChange, onSearchClick }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {activeTab === "notes" && (
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Mic className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-xl font-bold text-foreground">
            {TITLES[activeTab]}
          </h1>
        </div>
        {activeTab === "notes" && (
          <button
            type="button"
            onClick={onSearchClick}
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
            aria-label="搜索笔记"
          >
            <Search className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Tag filters for notes */}
      {activeTab === "notes" && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {FILTERS.map((filter) => (
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
      )}
    </header>
  );
}
