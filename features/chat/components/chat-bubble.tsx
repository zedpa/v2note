"use client";

import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/shared/components/markdown-content";
import type { ChatMessage, MessagePart } from "@/features/chat/hooks/use-chat";
import { ToolCallCard, ToolCallGroup } from "./tool-call-card";
import { SyncStatusIndicator } from "@/components/sync/sync-status-indicator";

interface ChatBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  /** Phase 7：重试失败条目（retryCount >= 5 → ⚠ 展开重试/删除） */
  onRetrySync?: (localId: string) => void | Promise<void>;
  /** Phase 7：删除本地未同步条目 */
  onDeleteSync?: (localId: string) => void | Promise<void>;
}

type ToolCallPart = Extract<MessagePart, { type: "tool-call" }>;

/**
 * 将 parts 中连续的 tool-call 分组，以便折叠渲染
 * 输入: [text, tool, tool, text, tool] → 输出: [text, [tool, tool], text, [tool]]
 */
function groupParts(parts: MessagePart[]): Array<MessagePart | ToolCallPart[]> {
  const groups: Array<MessagePart | ToolCallPart[]> = [];
  let currentToolGroup: ToolCallPart[] | null = null;

  for (const part of parts) {
    if (part.type === "tool-call") {
      if (!currentToolGroup) currentToolGroup = [];
      currentToolGroup.push(part);
    } else {
      if (currentToolGroup) {
        groups.push(currentToolGroup);
        currentToolGroup = null;
      }
      groups.push(part);
    }
  }
  if (currentToolGroup) groups.push(currentToolGroup);
  return groups;
}

export function ChatBubble({ message, streaming, onRetrySync, onDeleteSync }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const localId = message.localId;

  return (
    <div
      className={cn(
        "flex gap-3 mb-6 items-start",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* AI 头像 */}
      {!isUser && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base"
          style={{
            background: "linear-gradient(135deg, #3A2E28, #2A201A)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          }}
        >
          🦌
        </div>
      )}

      {/* 气泡 + 同步状态列 */}
      <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "max-w-[85%] px-[18px] py-[14px] text-sm leading-[1.6] text-on-surface",
            isUser ? "bg-sky/15" : "bg-surface-high",
          )}
          style={{
            borderRadius: isUser
              ? "20px 20px 4px 20px"
              : "20px 20px 20px 4px",
            border: isUser ? undefined : "1px solid rgba(255,255,255,0.03)",
          }}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.parts && message.parts.length > 0 ? (
            /* Parts 模式渲染 */
            <PartsRenderer parts={message.parts} streaming={streaming} />
          ) : message.content ? (
            <MarkdownContent>{message.content}</MarkdownContent>
          ) : streaming ? (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          ) : null}
        </div>
        {/* Phase 7：同步状态标识（共享组件，支持 retry >= 5 的 ⚠ + 展开面板） */}
        {isUser && message.syncStatus ? (
          <SyncStatusIndicator
            status={message.syncStatus}
            retryCount={message.retryCount}
            lastError={message.lastError}
            onRetry={localId && onRetrySync ? () => onRetrySync(localId) : undefined}
            onDelete={localId && onDeleteSync ? () => onDeleteSync(localId) : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}

/** 按 parts 数组分发渲染：text → Markdown, tool-call → ToolCallCard/Group */
function PartsRenderer({ parts, streaming }: { parts: MessagePart[]; streaming?: boolean }) {
  const grouped = groupParts(parts);

  // 检查是否只有空 text part（还在等待 AI 输出文本）
  const isEmpty = grouped.length === 0 ||
    (grouped.length === 1 && !Array.isArray(grouped[0]) && grouped[0].type === "text" && !grouped[0].text);

  if (isEmpty && streaming) {
    return (
      <span className="inline-flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    );
  }

  return (
    <>
      {grouped.map((item, i) => {
        if (Array.isArray(item)) {
          return <ToolCallGroup key={`tg-${i}`} parts={item} />;
        }
        if (item.type === "text") {
          if (!item.text) return null;
          return <MarkdownContent key={`txt-${i}`}>{item.text}</MarkdownContent>;
        }
        if (item.type === "step-start") {
          return <hr key={`sep-${i}`} className="my-2 border-border/30" />;
        }
        return null;
      })}
    </>
  );
}
