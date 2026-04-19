"use client";

/**
 * SyncStatusIndicator — 同步状态小标识（时间线 + 聊天共用）
 *
 * regression: fix-cold-resume-silent-loss (Phase 7 §5.1)
 *
 * 行为契约：
 *   - captured / syncing → ⏳ 灰色
 *   - synced             → 不渲染任何内容
 *   - failed + retryCount < 5 → 不渲染（与 synced 视觉一致，不打扰）
 *   - failed + retryCount >= 5 → 淡红色 ⚠，点击展开 [重试] [删除]
 *
 * 使用方：
 *   - features/chat/components/chat-bubble.tsx（user 消息）
 *   - features/notes/components/notes-timeline.tsx（本地未同步日记条目）
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type SyncStatus = "captured" | "syncing" | "synced" | "failed";

export interface SyncStatusIndicatorProps {
  status: SyncStatus;
  /** 失败次数；用于判断是否到达提示阈值（>= 5 显示 ⚠） */
  retryCount?: number;
  /** 最后一次错误原因（展开面板中展示） */
  lastError?: string | null;
  /** 点击重试：由调用方触发 triggerSync + captureStore.update(retryCount=0, syncStatus='captured') */
  onRetry?: () => void | Promise<void>;
  /** 点击删除：由调用方触发 captureStore.delete + 本地 state 移除 */
  onDelete?: () => void | Promise<void>;
  className?: string;
}

const RETRY_THRESHOLD = 5;

export function SyncStatusIndicator({
  status,
  retryCount = 0,
  lastError,
  onRetry,
  onDelete,
  className,
}: SyncStatusIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleToggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  // M6：面板展开时，点击组件外部或按 Esc 关闭。
  useEffect(() => {
    if (!expanded) return;
    const handlePointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && !root.contains(target)) {
        setExpanded(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [expanded]);

  const handleRetry = useCallback(async () => {
    setExpanded(false);
    if (onRetry) await onRetry();
  }, [onRetry]);

  const handleDelete = useCallback(async () => {
    setExpanded(false);
    if (onDelete) await onDelete();
  }, [onDelete]);

  // synced → 不渲染
  if (status === "synced") return null;

  // failed + retryCount < 阈值 → 不渲染（视觉等同 synced，避免骚扰）
  if (status === "failed" && retryCount < RETRY_THRESHOLD) return null;

  // failed + retryCount >= 阈值 → 淡红色 ⚠ + 可展开面板
  if (status === "failed") {
    return (
      <div
        ref={rootRef}
        className={cn("mt-0.5 select-none", className)}
        data-testid="sync-status-indicator"
        data-status="failed-permanent"
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-label="同步失败，点击查看详情"
          aria-expanded={expanded}
          className="text-[10px] text-maple/80 hover:text-maple transition-colors"
        >
          ⚠ 同步失败
        </button>
        {expanded ? (
          <div className="mt-1 text-[11px] text-on-surface-muted bg-surface-high rounded px-2 py-1 flex flex-col gap-1 max-w-[240px]">
            <p className="text-maple/90 break-words">
              {lastError ? `失败原因：${lastError}` : "多次重试仍未同步"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="text-sky underline text-[11px]"
                aria-label="重试同步"
                data-testid="sync-retry"
              >
                重试
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="text-maple underline text-[11px]"
                aria-label="删除本地条目"
                data-testid="sync-delete"
              >
                删除
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // captured / syncing → ⏳
  return (
    <span
      className={cn(
        "text-[10px] text-muted-accessible/60 mt-0.5 select-none inline-block",
        className,
      )}
      title="同步中"
      aria-label="同步中"
      data-testid="sync-status-indicator"
      data-status={status}
    >
      ⏳
    </span>
  );
}
