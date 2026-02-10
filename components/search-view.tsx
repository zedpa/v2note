"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { useSearch } from "@/hooks/use-search";
import { NoteCard } from "./note-card";
import type { Note } from "./note-card";
import { SwipeBack } from "./swipe-back";

interface SearchViewProps {
  onClose: () => void;
  onNoteClick?: (noteId: string) => void;
}

export function SearchView({ onClose, onNoteClick }: SearchViewProps) {
  const [input, setInput] = useState("");
  const { results, loading, search } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInput = (value: string) => {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const displayNotes: Note[] = results.map((n) => ({
    id: n.id,
    title: n.title,
    tags: n.tags,
    summary: n.short_summary,
    date: n.date,
    time: n.time,
    location: n.location ?? undefined,
    type: "diary" as const,
  }));

  return (
    <SwipeBack onClose={onClose}>
      {/* Search bar */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 pt-safe border-b border-border/50">
        <div className="p-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-secondary">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="搜索笔记..."
              className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {input && (
              <button
                type="button"
                onClick={() => { setInput(""); search(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {!loading && input && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">未找到相关笔记</p>
          </div>
        )}

        {!loading && !input && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">输入关键词搜索笔记</p>
          </div>
        )}

        {!loading && displayNotes.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-4">
              找到 {displayNotes.length} 条结果
            </p>
            {displayNotes.map((note, i) => (
              <NoteCard
                key={note.id}
                note={note}
                isLast={i === displayNotes.length - 1}
                onClick={() => onNoteClick?.(note.id)}
              />
            ))}
          </div>
        )}
      </div>
    </SwipeBack>
  );
}
