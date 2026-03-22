"use client";

import { useEffect, useState } from "react";
import {
  fetchClusters,
  fetchClusterDetail,
  type ClusterSummary,
  type ClusterDetail,
} from "@/shared/lib/api/cognitive";

type ViewMode = "grid" | "network" | "mindmap";

export default function MapPage() {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");

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

  return (
    <div className="relative min-h-screen bg-cream">
      {/* Top toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-brand-border bg-cream/95 backdrop-blur px-6 py-3">
        <h1 className="text-lg font-bold text-bark mr-4">认知地图</h1>

        <div className="flex items-center gap-1 rounded-lg bg-sand/60 p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === "grid"
                ? "bg-white text-bark font-medium shadow-sm"
                : "text-bark/50 hover:text-bark/70"
            }`}
          >
            卡片
          </button>
          <button
            onClick={() => setViewMode("network")}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === "network"
                ? "bg-white text-bark font-medium shadow-sm"
                : "text-bark/50 hover:text-bark/70"
            }`}
          >
            网状图
          </button>
          <button
            onClick={() => setViewMode("mindmap")}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              viewMode === "mindmap"
                ? "bg-white text-bark font-medium shadow-sm"
                : "text-bark/50 hover:text-bark/70"
            }`}
          >
            思维导图
          </button>
        </div>

        <button className="ml-2 px-3 py-1 rounded text-xs text-bark/50 hover:text-bark/70 hover:bg-sand/50 transition-colors">
          自动布局
        </button>
        <button className="px-3 py-1 rounded text-xs text-bark/50 hover:text-bark/70 hover:bg-sand/50 transition-colors">
          适应窗口
        </button>

        <div className="ml-auto relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索主题…"
            className="w-48 pl-7 pr-3 py-1.5 rounded-lg border border-brand-border bg-white text-xs text-bark placeholder:text-bark/30 focus:outline-none focus:border-deer"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-bark/30 text-xs">🔍</span>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-stone-400">加载中…</p>
        ) : filteredClusters.length === 0 ? (
          <p className="text-stone-400">暂无聚类数据</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClusters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setSelectedId(selectedId === c.id ? null : c.id)
                }
                className={`rounded-lg border-2 bg-white p-4 text-left transition ${
                  selectedId === c.id
                    ? "border-deer shadow-md"
                    : "border-deer/40 hover:border-deer"
                }`}
              >
                <p className="font-semibold">{c.name}</p>
                <p className="mt-1 text-sm text-stone-500">
                  {c.memberCount} 条记录
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右侧详情面板 */}
      <div
        className={`fixed right-0 top-0 h-full w-80 overflow-y-auto border-l border-stone-200 bg-white p-5 shadow-lg transition-transform duration-300 ${
          selectedId ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="mb-4 text-sm text-stone-400 hover:text-stone-700"
        >
          ✕ 关闭
        </button>

        {detailLoading && <p className="text-stone-400">加载中…</p>}

        {detail && !detailLoading && (
          <>
            <h2 className="mb-3 text-lg font-bold">{detail.name}</h2>

            <section className="mb-4">
              <h3 className="mb-1 text-sm font-semibold text-stone-500">
                成员
              </h3>
              <ul className="space-y-1">
                {detail.members.map((m) => (
                  <li key={m.id} className="text-sm">
                    {m.nucleus}
                  </li>
                ))}
              </ul>
            </section>

            {detail.contradictions.length > 0 && (
              <section className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-red-500">
                  矛盾
                </h3>
                <ul className="space-y-1">
                  {detail.contradictions.map((c, i) => (
                    <li key={i} className="text-sm text-red-600">
                      {c.strikeA.nucleus} ↔ {c.strikeB.nucleus}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.patterns.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-semibold text-stone-500">
                  模式
                </h3>
                <ul className="space-y-1">
                  {detail.patterns.map((p) => (
                    <li key={p.id} className="text-sm">
                      {p.nucleus}
                      <span className="ml-1 text-stone-400">
                        {Math.round(p.confidence * 100)}%
                      </span>
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
