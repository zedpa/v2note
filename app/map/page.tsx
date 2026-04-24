"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  fetchClusters,
  fetchClusterDetail,
  type ClusterSummary,
  type ClusterDetail,
} from "@/shared/lib/api/cognitive";
import { PCLayout } from "@/components/layout/pc-layout";
import { KnowledgeContourMap } from "@/features/workspace/components/knowledge-contour-map";

type ViewMode = "network" | "mindmap" | "contour";

/* ── Layout helpers ── */
function computeRadialPositions(
  clusters: ClusterSummary[],
  centerX: number,
  centerY: number,
) {
  const positions: Record<string, { x: number; y: number }> = {};
  const count = clusters.length;
  if (count === 0) return positions;

  const radius = Math.max(220, count * 28);
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions[clusters[i].id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  }
  return positions;
}

/* ── SVG connection lines ── */
function ConnectionLines({
  clusters,
  positions,
  selectedId,
  detail,
}: {
  clusters: ClusterSummary[];
  positions: Record<string, { x: number; y: number }>;
  selectedId: string | null;
  detail: ClusterDetail | null;
}) {
  const centerX = 600;
  const centerY = 450;

  // Build edges: center→each node, plus pattern-based connections
  const edges: Array<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    highlight: boolean;
    strong: boolean;
  }> = [];

  // Radial edges from center to each node
  for (const c of clusters) {
    const pos = positions[c.id];
    if (!pos) continue;
    edges.push({
      from: { x: centerX, y: centerY },
      to: pos,
      highlight: selectedId === c.id,
      strong: c.recentlyActive,
    });
  }

  // Pattern-based edges (from selected node's detail)
  if (detail && selectedId && positions[selectedId]) {
    const fromPos = positions[selectedId];
    for (const p of detail.patterns) {
      const toPos = positions[p.id];
      if (toPos) {
        edges.push({
          from: fromPos,
          to: toPos,
          highlight: true,
          strong: p.confidence > 0.5,
        });
      }
    }
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
      style={{ minWidth: 1200, minHeight: 900 }}
    >
      {edges.map((edge, i) => {
        const mx = (edge.from.x + edge.to.x) / 2;
        const my = (edge.from.y + edge.to.y) / 2;
        // Offset control point for curve
        const dx = edge.to.x - edge.from.x;
        const dy = edge.to.y - edge.from.y;
        const cx = mx - dy * 0.15;
        const cy = my + dx * 0.15;

        return (
          <path
            key={i}
            d={`M ${edge.from.x} ${edge.from.y} Q ${cx} ${cy} ${edge.to.x} ${edge.to.y}`}
            fill="none"
            stroke={edge.highlight ? "#C8845C" : "#E0D5C8"}
            strokeWidth={edge.strong ? 2.5 : 1.5}
            strokeOpacity={edge.highlight ? 0.8 : 0.4}
          />
        );
      })}
    </svg>
  );
}

/* ── Semantic-zoom expanded node overlay ── */
function ExpandedNode({
  detail,
  onClose,
}: {
  detail: ClusterDetail;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-bark/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[70vh] w-[560px] overflow-y-auto rounded-xl border-2 border-deer bg-white p-5 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-bark">{detail.name}</h3>
          <button
            onClick={onClose}
            className="text-xs text-bark/40 hover:text-bark"
          >
            ✕ 收起
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {detail.members.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-brand-border bg-cream p-2 text-xs text-bark"
            >
              {m.nucleus}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Mind Map tree (card-style with SVG lines) ── */
function MindMapView({
  clusters,
  onSelect,
  onDoubleClick,
  selectedId,
}: {
  clusters: ClusterSummary[];
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  selectedId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* group by first character as pseudo-category */
  const groups = useMemo(() => {
    const g: Record<string, ClusterSummary[]> = {};
    for (const c of clusters) {
      const key = c.name.charAt(0) || "其他";
      if (!g[key]) g[key] = [];
      g[key].push(c);
    }
    return g;
  }, [clusters]);

  const groupEntries = Object.entries(groups);

  // Layout constants
  const rootX = 120;
  const rootY = 60;
  const groupStartX = 280;
  const itemStartX = 480;
  const groupGap = 100;
  const itemGap = 50;

  // Compute positions for SVG lines
  const groupPositions: Array<{ x: number; y: number }> = [];
  const itemPositions: Array<Array<{ x: number; y: number; clusterId: string }>> = [];
  let currentY = rootY;

  for (const [, items] of groupEntries) {
    const groupY = currentY + (items.length * itemGap) / 2;
    groupPositions.push({ x: groupStartX, y: groupY });
    const thisItems: Array<{ x: number; y: number; clusterId: string }> = [];
    for (let j = 0; j < items.length; j++) {
      thisItems.push({
        x: itemStartX,
        y: currentY + j * itemGap,
        clusterId: items[j].id,
      });
    }
    itemPositions.push(thisItems);
    currentY += items.length * itemGap + groupGap;
  }

  const totalHeight = currentY + 60;

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto"
      style={{
        minHeight: "calc(100dvh - 2.5rem)",
        backgroundImage: "radial-gradient(#E0D5C8 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        backgroundColor: "white",
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0"
        width="100%"
        height={totalHeight}
        style={{ minWidth: 700 }}
      >
        {/* Root → group lines */}
        {groupPositions.map((gp, i) => {
          const cx = (rootX + 60 + gp.x) / 2;
          return (
            <path
              key={`rg-${i}`}
              d={`M ${rootX + 60} ${rootY + 14} Q ${cx} ${rootY + 14} ${cx} ${gp.y} T ${gp.x} ${gp.y}`}
              fill="none"
              stroke="#E0D5C8"
              strokeWidth={2}
              strokeOpacity={0.6}
            />
          );
        })}
        {/* Group → item lines */}
        {groupPositions.map((gp, i) =>
          itemPositions[i].map((ip, j) => {
            const isSelected = selectedId === ip.clusterId;
            return (
              <path
                key={`gi-${i}-${j}`}
                d={`M ${gp.x + 50} ${gp.y} Q ${gp.x + 80} ${gp.y} ${(gp.x + 50 + ip.x) / 2} ${(gp.y + ip.y + 14) / 2} T ${ip.x} ${ip.y + 14}`}
                fill="none"
                stroke={isSelected ? "#C8845C" : "#E0D5C8"}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeOpacity={isSelected ? 0.8 : 0.4}
              />
            );
          }),
        )}
      </svg>

      {/* Root node */}
      <div
        className="absolute flex h-[28px] w-[120px] items-center justify-center rounded-xl border-2 border-deer bg-white font-black text-bark shadow-lg"
        style={{ left: rootX, top: rootY }}
      >
        🧠 我的认知
      </div>

      {/* Group nodes */}
      {groupEntries.map(([group], i) => {
        const pos = groupPositions[i];
        return (
          <div
            key={group}
            className="absolute flex h-[28px] items-center rounded-lg border border-brand-border bg-cream/80 px-3 text-xs font-semibold text-bark/70 shadow-sm"
            style={{ left: pos.x, top: pos.y - 14 }}
          >
            {group}
          </div>
        );
      })}

      {/* Leaf nodes */}
      {groupEntries.map(([, items], i) =>
        items.map((c, j) => {
          const pos = itemPositions[i][j];
          const isSelected = selectedId === c.id;
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              onDoubleClick={() => onDoubleClick(c.id)}
              className={`absolute flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-xs transition-all ${
                isSelected
                  ? "border-deer font-medium text-bark shadow-md"
                  : c.recentlyActive
                    ? "border-brand-border text-bark shadow-sm hover:border-deer"
                    : "border-brand-border/60 text-bark/60 hover:text-bark"
              }`}
              style={{ left: pos.x, top: pos.y }}
            >
              <span>{c.name}</span>
              <span className="rounded-full bg-sand px-1.5 py-0.5 text-[10px] text-[#9B8E82]">
                {c.memberCount}
              </span>
            </div>
          );
        }),
      )}
    </div>
  );
}

/* ── Floating canvas controls ── */
function CanvasControls({
  onFitView,
  onFocusSearch,
}: {
  onFitView: () => void;
  onFocusSearch: () => void;
}) {
  return (
    <div className="fixed bottom-8 right-8 z-20 flex flex-col gap-3">
      <button
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-bark/60 shadow-lg transition-colors hover:text-bark"
        title="缩放"
        disabled
      >
        <span className="text-sm font-bold">+</span>
      </button>
      <button
        onClick={onFitView}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-bark/60 shadow-lg transition-colors hover:text-bark"
        title="缩放适配"
      >
        <span className="text-sm">⊕</span>
      </button>
      <button
        onClick={onFocusSearch}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-bark/60 shadow-lg transition-colors hover:text-bark"
        title="搜索节点"
      >
        <span className="text-sm">🔍</span>
      </button>
    </div>
  );
}

/* ── Main Page ── */
export default function MapPage() {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("network");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  /* semantic zoom */
  const [expandedDetail, setExpandedDetail] = useState<ClusterDetail | null>(
    null,
  );

  /* drag-to-bond */
  const dragSource = useRef<string | null>(null);

  useEffect(() => {
    fetchClusters()
      .then(setClusters)
      .catch(() => setClusters([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    fetchClusterDetail(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const filteredClusters = clusters.filter((c) =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  /* Radial positions for network view */
  const centerX = 600;
  const centerY = 450;
  const positions = useMemo(
    () => computeRadialPositions(filteredClusters, centerX, centerY),
    [filteredClusters],
  );

  const handleNodeClick = useCallback(
    (id: string) => {
      setSelectedId(selectedId === id ? null : id);
    },
    [selectedId],
  );

  const handleNodeDoubleClick = useCallback((id: string) => {
    fetchClusterDetail(id)
      .then(setExpandedDetail)
      .catch(() => {});
  }, []);

  const handleDragStart = useCallback((id: string) => {
    dragSource.current = id;
  }, []);

  const handleDrop = useCallback((targetId: string) => {
    const sourceId = dragSource.current;
    if (sourceId && sourceId !== targetId) {
      console.log(
        `[Bond] drag from ${sourceId} → ${targetId} — manual bond created`,
      );
    }
    dragSource.current = null;
  }, []);

  /* fit-to-view: scroll center node into view */
  const handleFitView = useCallback(() => {
    if (canvasRef.current) {
      const container = canvasRef.current;
      container.scrollTo({
        left: centerX - container.clientWidth / 2,
        top: centerY - container.clientHeight / 2,
        behavior: "smooth",
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleFocusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <PCLayout>
      <div className="relative min-h-dvh bg-cream">
        {/* ── Top toolbar ── */}
        <div className="sticky top-0 z-20 flex h-10 items-center gap-2 border-b border-brand-border bg-sand px-4">
          {/* View switch */}
          <div className="flex items-center gap-1 rounded-lg bg-cream/60 p-0.5">
            <button
              onClick={() => setViewMode("network")}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                viewMode === "network"
                  ? "bg-white font-medium text-bark shadow-sm"
                  : "text-bark/50 hover:text-bark/70"
              }`}
            >
              🌐 网状图
            </button>
            <button
              onClick={() => setViewMode("mindmap")}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                viewMode === "mindmap"
                  ? "bg-white font-medium text-bark shadow-sm"
                  : "text-bark/50 hover:text-bark/70"
              }`}
            >
              🌲 思维导图
            </button>
            <button
              onClick={() => setViewMode("contour")}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                viewMode === "contour"
                  ? "bg-white font-medium text-bark shadow-sm"
                  : "text-bark/50 hover:text-bark/70"
              }`}
            >
              🗻 等高线
            </button>
          </div>

          <div className="relative ml-auto">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索节点…"
              className="w-48 rounded-lg border border-brand-border bg-white py-1.5 pl-7 pr-3 text-xs text-bark placeholder:text-bark/30 focus:border-deer focus:outline-none"
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-bark/30">
              🔍
            </span>
          </div>
        </div>

        {/* ── Content area ── */}
        {loading ? (
          <div className="p-8">
            <p className="text-sm text-bark/40">加载中…</p>
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className="p-8">
            <p className="text-sm text-bark/40">暂无聚类数据</p>
          </div>
        ) : viewMode === "contour" ? (
          /* ── Contour Map view ── */
          <KnowledgeContourMap
            onSelectPage={(id) => setSelectedId(id)}
            className="min-h-[calc(100dvh-2.5rem)]"
          />
        ) : viewMode === "network" ? (
          /* ── Network Graph view ── */
          <div
            ref={canvasRef}
            className="relative overflow-auto"
            style={{
              minHeight: "calc(100dvh - 2.5rem)",
              backgroundImage:
                "radial-gradient(#E0D5C8 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              backgroundColor: "white",
            }}
          >
            {/* SVG connection layer */}
            <ConnectionLines
              clusters={filteredClusters}
              positions={positions}
              selectedId={selectedId}
              detail={detail}
            />

            {/* Center root node */}
            <div
              className="absolute z-10 flex h-20 w-40 cursor-default items-center justify-center rounded-xl border-2 border-deer bg-white text-xl font-black text-bark shadow-lg"
              style={{
                left: centerX - 80,
                top: centerY - 40,
              }}
            >
              🧠 我的认知
            </div>

            {/* Theme nodes */}
            {filteredClusters.map((c) => {
              const pos = positions[c.id];
              if (!pos) return null;
              const isActive = c.recentlyActive;
              const isSelected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => handleDragStart(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(c.id)}
                  onClick={() => handleNodeClick(c.id)}
                  onDoubleClick={() => handleNodeDoubleClick(c.id)}
                  className={`absolute flex h-16 w-48 cursor-pointer items-center gap-2 rounded-xl border-2 bg-white px-3 transition-all ${
                    isSelected
                      ? "z-10 scale-105 border-deer shadow-lg"
                      : isActive
                        ? "border-deer shadow-md"
                        : "border-brand-border/40 opacity-70"
                  }`}
                  style={{ left: pos.x - 96, top: pos.y - 32 }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-bark">
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[#9B8E82]">
                      {c.memberCount} 条记录
                    </p>
                  </div>
                  {isActive && (
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-deer" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Mind Map view ── */
          <MindMapView
            clusters={filteredClusters}
            onSelect={handleNodeClick}
            onDoubleClick={handleNodeDoubleClick}
            selectedId={selectedId}
          />
        )}

        {/* ── Floating canvas controls ── */}
        <CanvasControls
          onFitView={handleFitView}
          onFocusSearch={handleFocusSearch}
        />

        {/* ── Semantic zoom overlay ── */}
        {expandedDetail && (
          <ExpandedNode
            detail={expandedDetail}
            onClose={() => setExpandedDetail(null)}
          />
        )}

        {/* ── Right panel: Node Detail (320px) ── */}
        <div
          className={`fixed right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l border-brand-border bg-white p-5 pt-16 shadow-sm transition-transform duration-300 ${
            selectedId ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mb-4 text-xs text-bark/40 hover:text-bark"
          >
            ✕ 关闭
          </button>

          {detailLoading && <p className="text-sm text-bark/40">加载中…</p>}

          {detail && !detailLoading && (
            <>
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-bark">
                <span className="text-lg">🧩</span>
                {detail.name}
              </h2>

              {/* 📊 概览 */}
              <section className="mb-4">
                <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold text-bark/60">
                  📊 概览
                </h3>
                <div className="space-y-1 text-xs text-bark/80">
                  <p>记录数：{detail.members.length} 条</p>
                  <p>
                    最近活跃：
                    {detail.members.length > 0
                      ? detail.members
                          .map((m) => m.created_at)
                          .sort()
                          .reverse()[0]
                          ?.slice(0, 10) ?? "—"
                      : "—"}
                  </p>
                  <p>
                    密度：
                    {detail.members.length > 10
                      ? "高密度主题"
                      : detail.members.length > 3
                        ? "中等密度"
                        : "低密度"}
                  </p>
                </div>
              </section>

              {/* 🎯 相关目标 */}
              {detail.intents.length > 0 && (
                <section className="mb-4">
                  <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold text-bark/60">
                    🎯 相关目标
                  </h3>
                  <ul className="space-y-1">
                    {detail.intents.map((intent) => (
                      <li
                        key={intent.id}
                        className="cursor-pointer rounded px-2 py-1 text-xs text-bark hover:bg-sand/60"
                      >
                        {intent.nucleus}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 📝 最近记录 */}
              <section className="mb-4">
                <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold text-bark/60">
                  📝 最近记录
                </h3>
                <ul className="space-y-1">
                  {detail.members.slice(0, 5).map((m) => (
                    <li
                      key={m.id}
                      className="cursor-pointer rounded px-2 py-1 text-xs text-bark hover:bg-sand/60"
                      title="点击跳转到时间线"
                    >
                      {m.nucleus}
                    </li>
                  ))}
                </ul>
              </section>

              {/* 🔗 关联主题 */}
              {detail.patterns.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold text-bark/60">
                    🔗 关联主题
                  </h3>
                  <ul className="space-y-2">
                    {detail.patterns.map((p) => (
                      <li key={p.id} className="text-xs text-bark">
                        <div className="mb-1 flex items-center justify-between">
                          <span>{p.nucleus}</span>
                          <span className="text-[#9B8E82]">
                            {Math.round(p.confidence * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-sand">
                          <div
                            className="h-1.5 rounded-full bg-deer/30"
                            style={{ width: `${p.confidence * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </PCLayout>
  );
}
