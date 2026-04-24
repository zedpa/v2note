"use client";

/**
 * 知识等高线地图 — 地理等高线风格的知识热力可视化
 *
 * 设计隐喻：
 * - 每个 wiki page 是地形上的一座"山"，heat_score 决定海拔
 * - 等高线（同心环）围绕山峰，间距越密 = 坡度越陡 = 知识越热
 * - 颜色从暖棕（热门）渐变到冷灰（冰封），呼应 Editorial Serenity 色系
 * - parent-child 关系体现为"山脉"——子 page 环绕在 parent 周围
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchHeatmap, type HeatmapPage, type HeatmapData } from "@/shared/lib/api/wiki-heatmap";
import { cn } from "@/lib/utils";

interface KnowledgeContourMapProps {
  onSelectPage: (pageId: string) => void;
  className?: string;
}

// 等高线颜色（海拔从高到低）
const CONTOUR_COLORS: Record<string, { fill: string; stroke: string; text: string; label: string }> = {
  hot:    { fill: "rgba(200, 132, 92, 0.12)",  stroke: "rgba(200, 132, 92, 0.35)", text: "text-[#89502C]", label: "热门" },
  active: { fill: "rgba(107, 142, 95, 0.10)",  stroke: "rgba(107, 142, 95, 0.30)", text: "text-[#5A7A4A]", label: "活跃" },
  silent: { fill: "rgba(155, 142, 130, 0.08)", stroke: "rgba(155, 142, 130, 0.22)", text: "text-[#9B8E82]", label: "静默" },
  frozen: { fill: "rgba(155, 162, 170, 0.06)", stroke: "rgba(155, 162, 170, 0.15)", text: "text-[#A0A8B0]", label: "冰封" },
};

// 布局：力导向简化版 — 用确定性圆形排列
function layoutPages(pages: HeatmapPage[], width: number, height: number) {
  if (pages.length === 0) return [];

  // 按 heat_score 降序
  const sorted = [...pages].sort((a, b) => b.heat_score - a.heat_score);
  const cx = width / 2;
  const cy = height / 2;

  // 分层排列：root pages 在外环，子 pages 环绕 parent
  const roots = sorted.filter((p) => !p.parent_id);
  const children = sorted.filter((p) => p.parent_id);

  const nodes: Array<{
    page: HeatmapPage;
    x: number;
    y: number;
    radius: number;
    contourRings: number;
  }> = [];

  // 最大 heat 用于归一化
  const maxHeat = Math.max(...pages.map((p) => p.heat_score), 1);

  // 放置 root pages — 螺旋排列，最热的在中心
  const placeInSpiral = (items: HeatmapPage[], centerX: number, centerY: number, startRadius: number) => {
    items.forEach((page, i) => {
      const normalizedHeat = page.heat_score / maxHeat;
      const radius = 18 + normalizedHeat * 30; // 18-48px
      const contourRings = page.heat_score > 8 ? 4 : page.heat_score > 3 ? 3 : page.heat_score > 1 ? 2 : 1;

      if (i === 0 && startRadius === 0) {
        // 最热的 page 在中心
        nodes.push({ page, x: centerX, y: centerY, radius, contourRings });
      } else {
        const angle = (i / Math.max(items.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
        const dist = startRadius + 60 + i * 18;
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;
        nodes.push({ page, x, y, radius, contourRings });
      }
    });
  };

  placeInSpiral(roots, cx, cy, 0);

  // 放置 children — ���绕 parent
  for (const child of children) {
    const parentNode = nodes.find((n) => n.page.id === child.parent_id);
    if (parentNode) {
      const siblingCount = children.filter((c) => c.parent_id === child.parent_id).length;
      const siblingIndex = children.filter((c) => c.parent_id === child.parent_id).indexOf(child);
      const angle = (siblingIndex / siblingCount) * Math.PI * 2;
      const dist = parentNode.radius + 50;
      const normalizedHeat = child.heat_score / maxHeat;
      const radius = 14 + normalizedHeat * 20;
      const contourRings = child.heat_score > 8 ? 3 : child.heat_score > 3 ? 2 : 1;
      nodes.push({
        page: child,
        x: parentNode.x + Math.cos(angle) * dist,
        y: parentNode.y + Math.sin(angle) * dist,
        radius,
        contourRings,
      });
    } else {
      // 孤儿 child — 放在边缘
      const normalizedHeat = child.heat_score / maxHeat;
      const radius = 14 + normalizedHeat * 20;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.min(width, height) * 0.35;
      nodes.push({
        page: child,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        radius,
        contourRings: 1,
      });
    }
  }

  return nodes;
}

export function KnowledgeContourMap({ onSelectPage, className }: KnowledgeContourMapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState({ width: 400, height: 400 });

  useEffect(() => {
    fetchHeatmap()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 响应容器尺寸
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setViewBox({ width: Math.max(rect.width, 300), height: Math.max(rect.height, 300) });
  }, []);

  const nodes = useMemo(() => {
    if (!data?.pages.length) return [];
    return layoutPages(data.pages, viewBox.width, viewBox.height);
  }, [data, viewBox]);

  const handleTap = useCallback((pageId: string) => {
    setSelectedId(pageId);
    onSelectPage(pageId);
  }, [onSelectPage]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-20", className)}>
        <div className="w-32 h-32 rounded-full border border-dashed border-muted-accessible/30 animate-pulse" />
      </div>
    );
  }

  if (!data || data.pages.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-20 px-8", className)}>
        <svg width="80" height="80" viewBox="0 0 80 80" className="opacity-20 mb-4">
          <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
          <circle cx="40" cy="40" r="25" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
          <circle cx="40" cy="40" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
        </svg>
        <p className="font-serif text-base text-muted-accessible">地图尚未成形</p>
        <p className="text-sm text-muted-accessible/60 mt-1">继续记录，知识地形会慢慢浮现</p>
      </div>
    );
  }

  // 计算 SVG viewBox 边界
  const padding = 60;
  const minX = Math.min(...nodes.map((n) => n.x - n.radius * 3)) - padding;
  const minY = Math.min(...nodes.map((n) => n.y - n.radius * 3)) - padding;
  const maxX = Math.max(...nodes.map((n) => n.x + n.radius * 3)) + padding;
  const maxY = Math.max(...nodes.map((n) => n.y + n.radius * 3)) + padding;
  const svgViewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* 图例 */}
      <div className="absolute top-3 right-3 z-10 flex gap-3 text-[10px]">
        {(["hot", "active", "silent", "frozen"] as const).map((phase) => (
          <span key={phase} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: CONTOUR_COLORS[phase].stroke.replace(/[\d.]+\)$/, "0.8)") }}
            />
            <span className={CONTOUR_COLORS[phase].text}>{CONTOUR_COLORS[phase].label}</span>
          </span>
        ))}
      </div>

      {/* 统计 */}
      {data.summary && (
        <div className="absolute top-3 left-3 z-10 text-[10px] text-muted-accessible/60 font-mono">
          {data.pages.length} peaks
        </div>
      )}

      <svg
        viewBox={svgViewBox}
        className="w-full h-full"
        style={{ minHeight: "300px" }}
      >
        {/* 背景网格（细微的经纬线） */}
        <defs>
          <pattern id="contour-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.15" opacity="0.08" />
          </pattern>
        </defs>
        <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="url(#contour-grid)" />

        {/* 等高线和峰 */}
        {nodes.map((node) => {
          const colors = CONTOUR_COLORS[node.page.heat_phase];
          const isSelected = selectedId === node.page.id;

          return (
            <g
              key={node.page.id}
              onClick={() => handleTap(node.page.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${node.page.title} — ${colors.label}`}
            >
              {/* 等高线环（从外到内） */}
              {Array.from({ length: node.contourRings }).map((_, ring) => {
                const ringRadius = node.radius + (node.contourRings - ring) * 12;
                const opacity = 0.15 + ring * 0.08;
                return (
                  <ellipse
                    key={ring}
                    cx={node.x}
                    cy={node.y}
                    rx={ringRadius * (1 + Math.sin(ring * 0.7) * 0.15)}
                    ry={ringRadius * (1 - Math.cos(ring * 0.5) * 0.1)}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={ring === 0 ? 0.5 : 0.3}
                    opacity={opacity}
                    transform={`rotate(${ring * 15 + node.page.title.charCodeAt(0) % 30}, ${node.x}, ${node.y})`}
                  />
                );
              })}

              {/* 山峰核心 */}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill={colors.fill.replace(/[\d.]+\)$/, "0.35)")}
                stroke={isSelected ? "hsl(var(--deer))" : colors.stroke}
                strokeWidth={isSelected ? 1.5 : 0.8}
              />

              {/* 峰顶标记 */}
              <circle
                cx={node.x}
                cy={node.y}
                r={3}
                fill={colors.stroke.replace(/[\d.]+\)$/, "0.7)")}
              />

              {/* 标签 */}
              <text
                x={node.x}
                y={node.y + node.radius + 14}
                textAnchor="middle"
                className="fill-current"
                style={{
                  fontSize: node.page.level === 3 ? "11px" : "9px",
                  fontFamily: "var(--font-serif)",
                  fill: isSelected ? "hsl(var(--deer))" : colors.stroke.replace(/[\d.]+\)$/, "0.8)"),
                  fontWeight: node.page.level === 3 ? 500 : 400,
                }}
              >
                {node.page.title.length > 8 ? node.page.title.slice(0, 8) + "…" : node.page.title}
              </text>

              {/* 海拔标注（heat_score） */}
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                style={{
                  fontSize: "8px",
                  fontFamily: "var(--font-mono)",
                  fill: colors.stroke.replace(/[\d.]+\)$/, "0.5)"),
                }}
              >
                {node.page.heat_score.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* parent-child 连接线（山脊线） */}
        {nodes
          .filter((n) => n.page.parent_id)
          .map((child) => {
            const parent = nodes.find((n) => n.page.id === child.page.parent_id);
            if (!parent) return null;
            return (
              <line
                key={`ridge-${child.page.id}`}
                x1={parent.x}
                y1={parent.y}
                x2={child.x}
                y2={child.y}
                stroke="currentColor"
                strokeWidth="0.3"
                opacity="0.08"
                strokeDasharray="4 4"
              />
            );
          })}
      </svg>
    </div>
  );
}
