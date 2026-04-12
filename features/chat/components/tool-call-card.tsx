"use client";

import { useState } from "react";
import {
  Globe,
  Search,
  SquarePen,
  Target,
  FolderOpen,
  Trash2,
  Wrench,
  Check,
  X,
  ChevronDown,
  Clock,
  BookOpen,
  FolderSync,
} from "lucide-react";
import type { MessagePart } from "@/features/chat/hooks/use-chat";

type ToolCallPart = Extract<MessagePart, { type: "tool-call" }>;

// ── 类型化图标映射 ──────────────────────────────────────────

const TOOL_ICON_MAP: Record<string, { icon: typeof Globe; color: string }> = {
  web_search:    { icon: Globe, color: "text-blue-500" },
  fetch_url:     { icon: Globe, color: "text-blue-500" },
  search:        { icon: Search, color: "text-deer" },
  create_todo:   { icon: SquarePen, color: "text-green-500" },
  update_todo:   { icon: SquarePen, color: "text-green-500" },
  create_goal:   { icon: Target, color: "text-amber-500" },
  update_goal:   { icon: Target, color: "text-amber-500" },
  create_project:{ icon: FolderOpen, color: "text-amber-500" },
  delete_record: { icon: Trash2, color: "text-red-500" },
  delete_todo:   { icon: Trash2, color: "text-red-500" },
  view_record:   { icon: BookOpen, color: "text-deer" },
  view_todo:     { icon: BookOpen, color: "text-deer" },
  view_goal:     { icon: BookOpen, color: "text-deer" },
  manage_wiki_page: { icon: FolderSync, color: "text-amber-500" },
  get_current_time: { icon: Clock, color: "text-muted-foreground" },
};

function getToolIcon(toolName: string) {
  return TOOL_ICON_MAP[toolName] ?? { icon: Wrench, color: "text-muted-foreground" };
}

// ── 单个工具卡片 ────────────────────────────────────────────

function SingleToolCard({ part }: { part: ToolCallPart }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, color } = getToolIcon(part.toolName);
  const isRunning = part.status === "running";
  const isError = part.status === "error";

  // 运行态
  if (isRunning) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-surface-low/50 my-1">
        <Icon size={16} className={`${color} animate-pulse shrink-0`} />
        <span className="shimmer-text text-sm font-medium">{part.label}</span>
      </div>
    );
  }

  // 完成态 / 错误态：可折叠
  const statusIcon = isError
    ? <X size={14} className="text-red-500 shrink-0" />
    : <Check size={14} className="text-green-600 shrink-0" />;

  // 提取简洁标签（去掉 emoji 和 "正在" 前缀 + 省略号）
  const shortLabel = part.label
    .replace(/^[\p{Emoji}\p{Emoji_Component}\s]+/u, "")
    .replace(/^正在/, "")
    .replace(/…$/, "");

  const durationText = part.durationMs != null && part.durationMs > 0
    ? `${(part.durationMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-surface-low/50 transition-colors w-full text-left group"
      >
        {statusIcon}
        <span className="text-sm text-muted-foreground">{shortLabel}</span>
        {durationText && (
          <span className="text-xs text-muted-foreground/60">{durationText}</span>
        )}
        {part.result && (
          <ChevronDown
            size={14}
            className={`text-muted-foreground/40 ml-auto transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* 可展开详情 */}
      {part.result && (
        <div className="tool-detail-wrapper" data-open={open}>
          <div className="tool-detail-inner">
            <div className="px-2 pb-1.5 pt-0.5">
              <p className="text-xs text-muted-foreground/70 leading-relaxed whitespace-pre-wrap">
                {part.result}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 工具分组（多个已完成工具折叠为一行） ──────────────────────

interface ToolCallGroupProps {
  parts: ToolCallPart[];
}

export function ToolCallGroup({ parts }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);

  // 有正在运行的工具 → 逐个显示，不分组
  const hasRunning = parts.some((p) => p.status === "running");

  if (hasRunning || parts.length <= 1) {
    return (
      <>
        {parts.map((p) => (
          <SingleToolCard key={p.callId} part={p} />
        ))}
      </>
    );
  }

  // 全部完成 → 可折叠分组
  const hasError = parts.some((p) => p.status === "error");

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-surface-low/50 transition-colors text-left"
      >
        {hasError
          ? <X size={14} className="text-red-500 shrink-0" />
          : <Check size={14} className="text-green-600 shrink-0" />}
        <span className="text-sm text-muted-foreground">
          路路用了 {parts.length} 个工具
        </span>
        <ChevronDown
          size={14}
          className={`text-muted-foreground/40 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div className="tool-detail-wrapper" data-open={expanded}>
        <div className="tool-detail-inner">
          {parts.map((p) => (
            <SingleToolCard key={p.callId} part={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 单卡片导出（用于散落在文本之间的单个工具调用） ──────────────

export { SingleToolCard as ToolCallCard };
