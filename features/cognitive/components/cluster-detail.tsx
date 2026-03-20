"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Eye, Scale, Lightbulb, Target, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchClusterDetail, type ClusterDetail as ClusterDetailType } from "@/shared/lib/api/cognitive";
import { updateStrike } from "@/shared/lib/api/strikes";

const POLARITY_ICON: Record<string, { icon: typeof Eye; color: string; label: string }> = {
  perceive: { icon: Eye, color: "text-blue-500", label: "感知" },
  judge: { icon: Scale, color: "text-orange-500", label: "判断" },
  realize: { icon: Lightbulb, color: "text-purple-500", label: "领悟" },
  intend: { icon: Target, color: "text-green-500", label: "意图" },
  feel: { icon: Heart, color: "text-red-500", label: "感受" },
};

interface ClusterDetailProps {
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
  onDecision?: (question: string) => void;
}

export function ClusterDetailView({ clusterId, isOpen, onClose, onDecision }: ClusterDetailProps) {
  const [detail, setDetail] = useState<ClusterDetailType | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && clusterId) {
      setDetail(null);
      setLoading(true);
      fetchClusterDetail(clusterId)
        .then((data) => {
          setDetail(data);
        })
        .catch((err) => {
          console.error("[ClusterDetail] fetchClusterDetail failed:", err, "url:", `/api/v1/cognitive/clusters/${clusterId}`);
          setDetail(null);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, clusterId]);

  const handlePatternConfirm = useCallback(async (id: string, confirmed: boolean) => {
    await updateStrike(id, {}).catch(() => {});
    // TODO: update confidence based on confirmed
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <button type="button" onClick={onClose} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">{detail?.name ?? "加载中..."}</h2>
          {detail && (
            <p className="text-xs text-muted-foreground">{detail.members.length}条认知记录</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : detail ? (
        <div className="p-4 space-y-4">
          {/* Cognitive patterns */}
          {detail.patterns.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">认知模式</h3>
              {detail.patterns.map((p) => (
                <div key={p.id} className="mb-2">
                  <p className="text-sm text-foreground">"{p.nucleus}"</p>
                  <div className="flex gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => handlePatternConfirm(p.id, true)}
                      className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                    >
                      是
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePatternConfirm(p.id, false)}
                      className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      否
                    </button>
                    <span className="text-[10px] text-muted-foreground self-center">这准确吗？</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contradictions */}
          {detail.contradictions.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">对立观点</h3>
              {detail.contradictions.map((c, i) => (
                <div key={i} className="mb-2">
                  <p className="text-sm">⚖️ "{c.strikeA.nucleus}"</p>
                  <p className="text-xs text-muted-foreground my-1">vs</p>
                  <p className="text-sm">⚖️ "{c.strikeB.nucleus}"</p>
                </div>
              ))}
              {onDecision && (
                <button
                  type="button"
                  onClick={() => onDecision(detail.contradictions[0]?.strikeA.nucleus ?? "")}
                  className="mt-2 text-xs px-3 py-1.5 rounded-full bg-amber-200/60 dark:bg-amber-800/30 text-amber-800 dark:text-amber-200"
                >
                  帮我想想这个问题
                </button>
              )}
            </div>
          )}

          {/* Goal status (intents) */}
          {detail.intents.length > 0 && (
            <div className="bg-card rounded-xl p-4 border border-border/60">
              <h3 className="text-sm font-medium mb-2">目标状态</h3>
              {detail.intents.map((intent) => {
                // Four-element spectrum: direction(intend), resource(perceive), path(intend with action bonds), drive(judge+realize+feel)
                const total = detail.members.length || 1;
                const direction = detail.intents.length / total;
                const resource = detail.members.filter((m) => m.polarity === "perceive").length / total;
                const drive = detail.members.filter((m) => ["judge", "realize", "feel"].includes(m.polarity)).length / total;
                const path = 0.2; // TODO: calculate from bonds to todo

                return (
                  <div key={intent.id} className="mb-3">
                    <p className="text-sm mb-2">🎯 {intent.nucleus}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "方向", value: direction },
                        { label: "资源", value: resource },
                        { label: "路径", value: path },
                        { label: "驱动", value: drive },
                      ].map((el) => (
                        <div key={el.label} className="text-center">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(5, el.value * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">{el.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground mt-1">
                四要素反映已有认知记录的丰富程度
              </p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-medium mb-3">认知时间线</h3>
            <div className="space-y-2">
              {detail.members.map((m) => {
                const cfg = POLARITY_ICON[m.polarity] ?? POLARITY_ICON.perceive;
                const Icon = cfg.icon;
                const date = new Date(m.created_at).toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                });
                return (
                  <div key={m.id} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-10 shrink-0 pt-0.5">
                      {date}
                    </span>
                    <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", cfg.color)} />
                    <p className="text-sm text-foreground flex-1">{m.nucleus}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">无法加载数据</div>
      )}
    </div>
  );
}
