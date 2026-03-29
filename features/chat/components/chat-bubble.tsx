"use client";

import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/shared/components/markdown-content";
import type { ChatMessage } from "@/features/chat/hooks/use-chat";

interface ChatBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
}

export function ChatBubble({ message, streaming }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isToolStatus = message.role === "tool-status";

  // 工具状态：临时 loading 卡片（streaming 结束后自动消失）
  if (isToolStatus) {
    return (
      <div className="flex gap-2.5 mb-4 flex-row">
        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm mt-0.5">
          🦌
        </div>
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-surface-low px-4 py-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-deer animate-pulse" />
          <span className="text-sm text-muted-foreground">{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2.5 mb-4",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* 头像 */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm mt-0.5">
          🦌
        </div>
      )}

      {/* 气泡 */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-sky/15 text-on-surface rounded-tr-sm"
            : "bg-surface-low text-on-surface rounded-tl-sm",
        )}
      >
        {message.content ? (
          isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <MarkdownContent>{message.content}</MarkdownContent>
          )
        ) : streaming ? (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-deer animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
