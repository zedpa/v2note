"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCognitiveMap } from "../hooks/use-cognitive-map";
import type { ClusterSummary } from "@/shared/lib/api/cognitive";

interface LifeMapProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCluster: (id: string) => void;
}

function ActivityDots({ memberCount, recentlyActive }: { memberCount: number; recentlyActive: boolean }) {
  const level = recentlyActive ? Math.min(4, Math.ceil(memberCount / 5)) : Math.min(2, Math.ceil(memberCount / 10));
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            i <= level ? "bg-primary" : "bg-muted-foreground/20",
          )}
        />
      ))}
    </div>
  );
}

function ClusterCard({ cluster, onClick }: { cluster: ClusterSummary; onClick: () => void }) {
  const daysSince = cluster.lastRecordAt
    ? Math.floor((Date.now() - new Date(cluster.lastRecordAt).getTime()) / 86400000)
    : null;

  let description = `${cluster.memberCount}条记录`;
  if (cluster.hasContradiction) description += " · 存在对立观点";
  else if (cluster.recentlyActive) description += " · 近两周活跃";
  else if (daysSince !== null && daysSince > 7) description += ` · 最后记录${daysSince}天前`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card rounded-2xl p-5 text-left transition-all hover:shadow-md active:scale-[0.98]"
    >
      <h3 className="text-lg font-medium text-foreground leading-snug">
        {cluster.name}
      </h3>
      <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
      <div className="mt-3">
        <ActivityDots
          memberCount={cluster.memberCount}
          recentlyActive={cluster.recentlyActive}
        />
      </div>
    </button>
  );
}

export function LifeMap({ isOpen, onClose, onSelectCluster }: LifeMapProps) {
  const { clusters, loading, loadClusters } = useCognitiveMap();

  useEffect(() => {
    if (isOpen && clusters.length === 0) {
      loadClusters();
    }
  }, [isOpen, clusters.length, loadClusters]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <button type="button" onClick={onClose} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">我的认知世界</h2>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg">认知世界还在萌芽中</p>
            <p className="text-sm mt-2">继续记录，结构会自动涌现</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {clusters.map((c) => (
              <ClusterCard
                key={c.id}
                cluster={c}
                onClick={() => onSelectCluster(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
