"use client";

import { useState, useRef } from "react";
import { Search, User, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewHeaderProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onSearchClick: () => void;
  onAvatarClick: () => void;
  tags: string[];
  onAddTag: (name: string) => void;
  onRemoveTag: (name: string) => void;
  isSystemTag: (name: string) => boolean;
}

export function NewHeader({
  activeFilter,
  onFilterChange,
  onSearchClick,
  onAvatarClick,
  tags,
  onAddTag,
  onRemoveTag,
  isSystemTag,
}: NewHeaderProps) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [longPressTag, setLongPressTag] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddConfirm = () => {
    const trimmed = newTagName.trim();
    if (trimmed) {
      onAddTag(trimmed);
    }
    setNewTagName("");
    setShowAddInput(false);
  };

  const handleTagTouchStart = (tag: string) => {
    if (isSystemTag(tag)) return;
    longPressTimer.current = setTimeout(() => {
      setLongPressTag(tag);
    }, 600);
  };

  const handleTagTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDeleteConfirm = (tag: string) => {
    onRemoveTag(tag);
    setLongPressTag(null);
    if (activeFilter === tag) {
      onFilterChange("");
    }
  };

  const handleTagClick = (tag: string) => {
    if (longPressTag) return;
    onFilterChange(activeFilter === tag ? "" : tag);
  };

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl pt-safe">
      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
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
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide items-center">
        {tags.map((tag) => (
          <div key={tag} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => handleTagClick(tag)}
              onTouchStart={() => handleTagTouchStart(tag)}
              onTouchEnd={handleTagTouchEnd}
              onTouchCancel={handleTagTouchEnd}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                activeFilter === tag
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
              )}
            >
              {tag}
            </button>

            {/* Delete confirmation popover */}
            {longPressTag === tag && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg p-2 flex items-center gap-2 whitespace-nowrap">
                <span className="text-xs text-muted-foreground">删除?</span>
                <button
                  type="button"
                  onClick={() => handleDeleteConfirm(tag)}
                  className="text-xs text-destructive font-medium px-2 py-0.5 rounded bg-destructive/10 hover:bg-destructive/20"
                >
                  确认
                </button>
                <button
                  type="button"
                  onClick={() => setLongPressTag(null)}
                  className="text-xs text-muted-foreground px-2 py-0.5 rounded hover:bg-secondary"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Add tag button / inline input */}
        {showAddInput ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddConfirm();
                if (e.key === "Escape") {
                  setShowAddInput(false);
                  setNewTagName("");
                }
              }}
              placeholder="标签名"
              autoFocus
              className="w-20 px-2.5 py-1.5 rounded-full text-xs bg-secondary text-foreground placeholder:text-muted-foreground outline-none border border-primary/30"
            />
            <button
              type="button"
              onClick={handleAddConfirm}
              className="p-1 rounded-full bg-primary text-primary-foreground"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { setShowAddInput(false); setNewTagName(""); }}
              className="p-1 rounded-full bg-secondary text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddInput(true)}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary/70 hover:bg-secondary flex items-center justify-center transition-colors"
            aria-label="添加标签"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Dismiss long-press overlay */}
      {longPressTag && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setLongPressTag(null)}
        />
      )}
    </header>
  );
}
