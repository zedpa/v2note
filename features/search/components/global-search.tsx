"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Overlay } from "@/components/layout/overlay";
import { api } from "@/shared/lib/api";

interface SearchResult {
  id: string;
  created_at: string;
  summary?: { title?: string };
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await api.get<SearchResult[]>(
          `/api/v1/records?q=${encodeURIComponent(value.trim())}`,
        );
        setResults(data ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const formatTime = (iso: string) => {
    const dt = new Date(iso);
    const month = dt.getMonth() + 1;
    const day = dt.getDate();
    const hours = dt.getHours().toString().padStart(2, "0");
    const minutes = dt.getMinutes().toString().padStart(2, "0");
    return `${month}月${day}日 ${hours}:${minutes}`;
  };

  return (
    <Overlay isOpen={isOpen} onClose={onClose} mode="modal" width="520px">
      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bark/40 dark:text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="搜索笔记..."
          className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-sand/60 dark:bg-secondary text-sm text-bark dark:text-foreground placeholder:text-bark/40 dark:placeholder:text-muted-foreground outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
          >
            <X className="w-4 h-4 text-bark/40 dark:text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-bark/20 dark:border-primary/30 border-t-bark dark:border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-bark/50 dark:text-muted-foreground">
          <p className="text-sm">未找到相关笔记</p>
        </div>
      )}

      {!loading && !query && (
        <div className="flex flex-col items-center justify-center py-12 text-bark/50 dark:text-muted-foreground">
          <Search className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">输入关键词搜索笔记</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div>
          <p className="text-xs text-bark/50 dark:text-muted-foreground mb-3">
            找到 {results.length} 条结果
          </p>
          <ul className="space-y-1">
            {results.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-sand/60 dark:hover:bg-secondary transition-colors cursor-pointer"
              >
                <span className="text-sm text-bark dark:text-foreground truncate mr-3">
                  {item.summary?.title || "无标题"}
                </span>
                <span className="text-xs text-bark/40 dark:text-muted-foreground whitespace-nowrap">
                  {formatTime(item.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Overlay>
  );
}
