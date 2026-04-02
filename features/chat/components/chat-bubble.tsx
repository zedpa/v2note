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

  // 工具状态：临时 loading 卡片
  if (isToolStatus) {
    return (
      <div className="flex gap-3 mb-6 flex-row items-start">
        {/* AI 头像 — 品牌色渐变底板 */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base"
          style={{
            background: "linear-gradient(135deg, #3A2E28, #2A201A)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          }}
        >
          🦌
        </div>
        <div
          className="flex items-center gap-2 bg-surface-high px-[18px] py-[14px]"
          style={{
            borderRadius: "20px 20px 20px 4px",
            border: "1px solid rgba(255,255,255,0.03)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-deer animate-pulse" />
          <span className="text-sm text-muted-foreground leading-[1.6]">{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 mb-6 items-start",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* AI 头像 — 品牌色渐变底板 + glow */}
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

      {/* 气泡 — 非对称圆角 + 宽松内边距 */}
      <div
        className={cn(
          "max-w-[85%] px-[18px] py-[14px] text-sm leading-[1.6] text-on-surface",
          isUser ? "bg-sky/15" : "bg-surface-high",
        )}
        style={{
          borderRadius: isUser
            ? "20px 20px 4px 20px"   // 用户: 右下收窄
            : "20px 20px 20px 4px",   // AI: 左下收窄
          border: isUser ? undefined : "1px solid rgba(255,255,255,0.03)",
        }}
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
