"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Link2 } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCognitiveMap } from "../hooks/use-cognitive-map";
import { createBond } from "@/shared/lib/api/cognitive";
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

function ClusterCard({
  cluster,
  onClick,
  onLongPress,
  isSource,
  isTarget,
}: {
  cluster: ClusterSummary;
  onClick: () => void;
  onLongPress?: () => void;
  isSource?: boolean;
  isTarget?: boolean;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const daysSince = cluster.lastRecordAt
    ? Math.floor((Date.now() - new Date(cluster.lastRecordAt).getTime()) / 86400000)
    : null;

  let description = `${cluster.memberCount}条记录`;
  if (cluster.hasContradiction) description += " · 存在对立观点";
  else if (cluster.recentlyActive) description += " · 近两周活跃";
  else if (daysSince !== null && daysSince > 7) description += ` · 最后记录${daysSince}天前`;

  const handlePointerDown = () => {
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.();
    }, 500);
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!didLongPress.current) {
      onClick();
    }
  };

  const handlePointerCancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={cn(
        "bg-card rounded-2xl p-5 text-left transition-all hover:shadow-md active:scale-[0.98]",
        isSource && "ring-2 ring-primary",
        isTarget && "border-2 border-dashed border-primary/50",
      )}
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
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && clusters.length === 0) {
      loadClusters();
    }
  }, [isOpen, clusters.length, loadClusters]);

  const handleCardClick = useCallback(
    async (clusterId: string) => {
      if (!connectingFrom) {
        onSelectCluster(clusterId);
        return;
      }
      if (connectingFrom === clusterId) {
        // Clicked the source card again — cancel
        setConnectingFrom(null);
        return;
      }
      // Create bond between the two clusters
      try {
        await createBond({
          sourceStrikeId: connectingFrom,
          targetStrikeId: clusterId,
          type: "manual",
        });
        toast.success("已建立连接");
      } catch {
        toast.error("连接创建失败");
      }
      setConnectingFrom(null);
    },
    [connectingFrom, onSelectCluster],
  );

  const handleBackgroundClick = useCallback(() => {
    if (connectingFrom) setConnectingFrom(null);
  }, [connectingFrom]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-y-auto"
      onClick={handleBackgroundClick}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">我的认知世界</h2>
      </div>

      {/* Connection mode banner */}
      {connectingFrom && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary text-sm">
          <Link2 className="w-4 h-4" />
          <span>点击另一个主题建立连接</span>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <LuluLogo size={80} variant="color" />
            <p className="text-sm mt-4 text-center leading-relaxed">
              路路正在观察你的世界<br />
              继续记录，结构会自然涌现
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {clusters.map((c) => (
              <ClusterCard
                key={c.id}
                cluster={c}
                onClick={() => handleCardClick(c.id)}
                onLongPress={() => setConnectingFrom(c.id)}
                isSource={connectingFrom === c.id}
                isTarget={!!connectingFrom && connectingFrom !== c.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
