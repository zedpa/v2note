"use client";

import { type CSSProperties } from "react";

interface PullRefreshIndicatorProps {
  /** 当前拉动距离（已阻尼），0 表示隐藏 */
  pullDistance: number;
  /** 是否超过阈值（箭头翻转） */
  isReady: boolean;
  /** 是否正在刷新 */
  isRefreshing: boolean;
}

/**
 * 下拉刷新指示器
 * - 位于 header 下方，推开内容区（通过 height 实现）
 * - 拉动未到阈值: 箭头 ↓
 * - 超过阈值: 箭头翻转 ↑
 * - 刷新中: 旋转动画
 * - 收回动画: 300ms ease-out
 * - prefers-reduced-motion: 无动画
 */
export function PullRefreshIndicator({
  pullDistance,
  isReady,
  isRefreshing,
}: PullRefreshIndicatorProps) {
  // 不显示时高度为 0
  const visible = pullDistance > 0 || isRefreshing;
  const height = isRefreshing ? 48 : Math.min(pullDistance, 120);

  const containerStyle: CSSProperties = {
    height: visible ? height : 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    // 收回动画 300ms ease-out（拖拽中不加 transition，松手后才有）
    transition: isRefreshing || pullDistance === 0 ? "height 300ms ease-out" : "none",
  };

  // 箭头或旋转图标
  const iconStyle: CSSProperties = {
    color: "#C8845C", // deer 色
    fontSize: 18,
    lineHeight: 1,
    transition: "transform 200ms ease-out",
    transform: isRefreshing
      ? undefined // 旋转动画通过 CSS animation 实现
      : isReady
        ? "rotate(180deg)"
        : "rotate(0deg)",
  };

  const textStyle: CSSProperties = {
    color: "#7B6E62", // 弱文字色
    fontSize: 12,
  };

  if (!visible) return null;

  return (
    <div
      data-testid="pull-refresh-indicator"
      style={containerStyle}
    >
      {isRefreshing ? (
        <>
          <span
            className="pull-refresh-spinner"
            style={iconStyle}
            aria-hidden="true"
          >
            ↻
          </span>
          <span style={textStyle}>刷新中...</span>
        </>
      ) : (
        <span style={iconStyle} aria-hidden="true">
          {isReady ? "↑" : "↓"}
        </span>
      )}

      {/* 旋转动画样式 — 内联注入避免依赖外部 CSS */}
      <style>{`
        @keyframes pull-refresh-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .pull-refresh-spinner {
          animation: pull-refresh-spin 0.8s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .pull-refresh-spinner {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
