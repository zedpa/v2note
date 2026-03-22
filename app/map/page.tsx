"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchClusters,
  fetchClusterDetail,
  type ClusterSummary,
  type ClusterDetail,
} from "@/shared/lib/api/cognitive";

type ViewMode = "network" | "mindmap";

/* ── helpers ── */
function gridPosition(index: number, cols: number) {
  const gap = 200;
  const offsetX = 80;
  const offsetY = 80;
  return {
    x: offsetX + (index % cols) * gap,
    y: offsetY + Math.floor(index / cols) * gap,
  };
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

/* ── Mind Map tree ── */
function MindMapView({
  clusters,
  onSelect,
  selectedId,
}: {
  clusters: ClusterSummary[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  /* group by first character as pseudo-project */
  const groups: Record<string, ClusterSummary[]> = {};
  for (const c of clusters) {
    const key = c.name.charAt(0) || "其他";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        {/* root */}
        <div className="mb-4 text-sm font-bold text-bark">我的认知</div>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-3 ml-6 border-l-2 border-brand-border pl-4">
            <div className="mb-1 text-xs font-semibold text-bark/70">
              {group}
            </div>
            {items.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`mb-1 ml-4 flex items-center gap-2 border-l-2 pl-3 text-left text-xs transition-colors ${
                  selectedId === c.id
                    ? "border-deer text-bark font-medium"
                    : "border-brand-border text-bark/60 hover:text-bark"
                }`}
              >
                <span>{c.name}</span>
                <span className="text-[#9B8E82]">{c.memberCount}条</span>
              </button>
            ))}
          </div>
        ))}
      </div>
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

  const handleNodeClick = useCallback(
    (id: string) => {
      setSelectedId(selectedId === id ? null : id);
    },
    [selectedId],
  );

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      fetchClusterDetail(id)
        .then(setExpandedDetail)
        .catch(() => {});
    },
    [],
  );

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

  /* auto-layout: shuffle positions (placeholder) */
  const handleAutoLayout = useCallback(() => {
    console.log("[AutoLayout] triggered");
  }, []);

  /* fit-to-view: scroll to top (placeholder) */
  const handleFitView = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const cols = Math.max(3, Math.ceil(Math.sqrt(filteredClusters.length)));

  return (
    <div className="relative min-h-screen bg-cream">
      {/* ── Top toolbar ── */}
      <div className="sticky top-0 z-20 flex h-10 items-center gap-2 border-b border-brand-border bg-sand px-4">
        {/* View switch */}
        <div className="flex items-center gap-1 rounded-lg bg-cream/60 p-0.5">
          <button
            onClick={() => setViewMode("network")}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === "network"
                ? "bg-white text-bark font-medium shadow-sm"
                : "text-bark/50 hover:text-bark/70"
            }`}
          >
            🌐 网状图
          </button>
          <button
            onClick={() => setViewMode("mindmap")}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === "mindmap"
                ? "bg-white text-bark font-medium shadow-sm"
                : "text-bark/50 hover:text-bark/70"
            }`}
          >
            🌲 思维导图
          </button>
        </div>

        <button
          onClick={handleAutoLayout}
          className="px-3 py-1 rounded text-xs text-bark/50 hover:text-bark/70 hover:bg-cream/50 transition-colors"
        >
          自动布局
        </button>
        <button
          onClick={handleFitView}
          className="px-3 py-1 rounded text-xs text-bark/50 hover:text-bark/70 hover:bg-cream/50 transition-colors"
        >
          缩放适配
        </button>

        <div className="ml-auto relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索节点…"
            className="w-48 pl-7 pr-3 py-1.5 rounded-lg border border-brand-border bg-white text-xs text-bark placeholder:text-bark/30 focus:outline-none focus:border-deer"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-bark/30 text-xs">
            🔍
          </span>
        </div>
      </div>

      {/* ── Content area ── */}
      {loading ? (
        <div className="p-8">
          <p className="text-bark/40 text-sm">加载中…</p>
        </div>
      ) : filteredClusters.length === 0 ? (
        <div className="p-8">
          <p className="text-bark/40 text-sm">暂无聚类数据</p>
        </div>
      ) : viewMode === "network" ? (
        /* ── Network Graph view ── */
        <div
          className="relative min-h-[calc(100vh-2.5rem)] overflow-auto"
          style={{
            background:
              "white repeating-conic-gradient(#E0D5C8 0% 25%, transparent 0% 50%) 0 0 / 32px 32px",
          }}
        >
          {filteredClusters.map((c, i) => {
            const pos = gridPosition(i, cols);
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
                className={`absolute w-[160px] cursor-pointer rounded-lg border-2 bg-white p-3 transition-all ${
                  isSelected
                    ? "border-deer shadow-sm z-10"
                    : isActive
                      ? "border-deer shadow-sm"
                      : "border-brand-border opacity-70"
                }`}
                style={{ left: pos.x, top: pos.y }}
              >
                <p className="text-sm font-bold text-bark">{c.name}</p>
                <p className="mt-1 text-xs text-[#9B8E82]">
                  {c.memberCount} 条记录
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Mind Map view ── */
        <MindMapView
          clusters={filteredClusters}
          onSelect={handleNodeClick}
          selectedId={selectedId}
        />
      )}

      {/* ── Semantic zoom overlay ── */}
      {expandedDetail && (
        <ExpandedNode
          detail={expandedDetail}
          onClose={() => setExpandedDetail(null)}
        />
      )}

      {/* ── Right panel: Node Detail (320px) ── */}
      <div
        className={`fixed right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l border-brand-border bg-white p-5 shadow-sm transition-transform duration-300 ${
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

        {detailLoading && <p className="text-bark/40 text-sm">加载中…</p>}

        {detail && !detailLoading && (
          <>
            <h2 className="mb-4 text-base font-bold text-bark">
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
                      <div className="flex items-center justify-between mb-1">
                        <span>{p.nucleus}</span>
                        <span className="text-[#9B8E82]">
                          {Math.round(p.confidence * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-sand">
                        <div
                          className="h-1.5 rounded-full bg-sky/20"
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
  );
}
