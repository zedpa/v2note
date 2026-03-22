"use client";

import { useState, useEffect, useMemo } from "react";
import { Link2 } from "lucide-react";
import { Overlay } from "@/components/layout/overlay";
import { api } from "@/shared/lib/api";

interface Cluster {
  id: string;
  name: string;
  count: number;
  keywords?: string[];
}

interface StructurePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentText: string;
}

export function StructurePanel({
  isOpen,
  onClose,
  currentText,
}: StructurePanelProps) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api
      .get<Cluster[]>("/api/v1/cognitive/clusters")
      .then((data) => setClusters(data ?? []))
      .catch(() => setClusters([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const relevantId = useMemo(() => {
    if (!currentText.trim() || clusters.length === 0) return null;
    const textLower = currentText.toLowerCase();
    let bestId: string | null = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const words = [
        cluster.name,
        ...(cluster.keywords ?? []),
      ];
      let score = 0;
      for (const word of words) {
        if (word && textLower.includes(word.toLowerCase())) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = cluster.id;
      }
    }
    return bestId;
  }, [currentText, clusters]);

  return (
    <Overlay isOpen={isOpen} onClose={onClose} mode="sidebar" width="280px" title="认知结构">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-bark/20 dark:border-primary/30 border-t-bark dark:border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && clusters.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-bark/50 dark:text-muted-foreground">
          <p className="text-sm">暂无认知簇</p>
        </div>
      )}

      {!loading && clusters.length > 0 && (
        <ul className="space-y-1">
          {clusters.map((cluster) => {
            const isRelevant = cluster.id === relevantId;
            return (
              <li
                key={cluster.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                  isRelevant
                    ? "bg-sand dark:bg-secondary ring-1 ring-deer/40"
                    : "hover:bg-sand/60 dark:hover:bg-secondary"
                }`}
              >
                <div className="flex-1 min-w-0 mr-2">
                  <span
                    className={`text-sm truncate block ${
                      isRelevant
                        ? "text-bark dark:text-foreground font-medium"
                        : "text-bark/80 dark:text-foreground/80"
                    }`}
                  >
                    {cluster.name}
                  </span>
                  <span className="text-xs text-bark/40 dark:text-muted-foreground">
                    {cluster.count} 条记录
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 p-1.5 rounded-md text-bark/40 hover:text-bark dark:text-foreground/40 dark:hover:text-foreground hover:bg-sand dark:hover:bg-secondary transition-colors"
                  aria-label={`链接到 ${cluster.name}`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Overlay>
  );
}
