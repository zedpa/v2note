"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  X,
  FileText,
  Hash,
  Target,
  User,
  Command,
} from "lucide-react";
import { Overlay } from "@/components/layout/overlay";
import { searchRecords } from "@/shared/lib/api/records";
import { fetchClusters, type ClusterSummary } from "@/shared/lib/api/cognitive";
import { listGoals } from "@/shared/lib/api/goals";
import { COMMANDS, type Command as CmdType } from "@/features/writing/components/command-palette";
import type { Goal } from "@/shared/lib/types";

/* ── result item (unified across categories) ── */
interface ResultItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary?: string;
  shortcut?: string;
}

interface CategoryResults {
  key: string;
  label: string;
  items: ResultItem[];
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<ResultItem[]>([]);
  const [topics, setTopics] = useState<ClusterSummary[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load topics & goals once when opened
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setRecords([]);
      setSelectedIndex(0);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 100);

    fetchClusters()
      .then(setTopics)
      .catch(() => setTopics([]));
    listGoals()
      .then(setGoals)
      .catch(() => setGoals([]));
  }, [isOpen]);

  // Debounced record search
  const handleChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setRecords([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await searchRecords(value.trim());
        setRecords(
          (data ?? []).map((r: any) => ({
            id: r.id,
            icon: <FileText className="w-4 h-4" />,
            title: r.summary?.title || "无标题",
            summary: r.summary?.short_summary || r.created_at?.slice(0, 10) || "",
          })),
        );
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  // Filter topics locally
  const matchedTopics = useMemo<ResultItem[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return topics
      .filter((t) => t.name.toLowerCase().includes(q))
      .map((t) => ({
        id: t.id,
        icon: <Hash className="w-4 h-4" />,
        title: t.name,
        summary: `${t.memberCount} 条记录`,
      }));
  }, [query, topics]);

  // Filter goals locally
  const matchedGoals = useMemo<ResultItem[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return goals
      .filter((g) => g.title.toLowerCase().includes(q))
      .map((g) => ({
        id: g.id,
        icon: <Target className="w-4 h-4" />,
        title: g.title,
        summary: g.status ?? "",
      }));
  }, [query, goals]);

  // People — placeholder for future people API; static for now
  const matchedPeople = useMemo<ResultItem[]>(() => {
    // No people API yet — return empty
    return [];
  }, []);

  // Filter commands locally
  const matchedCommands = useMemo<ResultItem[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return COMMANDS.filter(
      (c) => c.label.includes(q) || c.key.toLowerCase().includes(q),
    ).map((c) => ({
      id: c.key,
      icon: <Command className="w-4 h-4" />,
      title: c.label,
      summary: c.insert ? `插入 ${c.insert.trim()}` : "打开",
      shortcut: c.shortcut,
    }));
  }, [query]);

  // Build categorized list
  const categories = useMemo<CategoryResults[]>(() => {
    const cats: CategoryResults[] = [];
    if (records.length) cats.push({ key: "records", label: "记录", items: records });
    if (matchedTopics.length) cats.push({ key: "topics", label: "主题", items: matchedTopics });
    if (matchedGoals.length) cats.push({ key: "goals", label: "目标", items: matchedGoals });
    if (matchedPeople.length) cats.push({ key: "people", label: "人物", items: matchedPeople });
    if (matchedCommands.length) cats.push({ key: "commands", label: "命令", items: matchedCommands });
    return cats;
  }, [records, matchedTopics, matchedGoals, matchedPeople, matchedCommands]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(
    () => categories.flatMap((c) => c.items),
    [categories],
  );

  // Keep selectedIndex in bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      e.preventDefault();
      // TODO: navigate / execute selected item
    }
  };

  const totalResults = flatItems.length;

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
          onKeyDown={handleKeyDown}
          placeholder="搜索记录、主题、目标、命令..."
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-bark/20 dark:border-primary/30 border-t-bark dark:border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && query && totalResults === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-bark/50 dark:text-muted-foreground">
          <p className="text-sm">未找到相关结果</p>
        </div>
      )}

      {/* Placeholder when empty */}
      {!loading && !query && (
        <div className="flex flex-col items-center justify-center py-12 text-bark/50 dark:text-muted-foreground">
          <Search className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">输入关键词搜索</p>
        </div>
      )}

      {/* Categorized results */}
      {!loading && totalResults > 0 && (
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {categories.map((cat) => {
            return (
              <div key={cat.key} className="mb-3">
                <p className="text-xs text-bark/50 dark:text-muted-foreground mb-1.5 px-1 font-medium">
                  {cat.label}
                </p>
                <ul className="space-y-0.5">
                  {cat.items.map((item) => {
                    const flatIdx = flatItems.indexOf(item);
                    const isActive = flatIdx === selectedIndex;
                    return (
                      <li
                        key={`${cat.key}-${item.id}`}
                        data-active={isActive}
                        onMouseEnter={() => setSelectedIndex(flatIdx)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isActive
                            ? "bg-sand/80 dark:bg-secondary"
                            : "hover:bg-sand/60 dark:hover:bg-secondary/60"
                        }`}
                      >
                        <span className="shrink-0 text-bark/60 dark:text-muted-foreground">
                          {item.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-bark dark:text-foreground truncate block">
                            {item.title}
                          </span>
                          {item.summary && (
                            <span className="text-xs text-bark/40 dark:text-muted-foreground truncate block">
                              {item.summary}
                            </span>
                          )}
                        </span>
                        {item.shortcut && (
                          <span className="shrink-0 text-xs text-bark/40 dark:text-muted-foreground font-mono">
                            {item.shortcut}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}
