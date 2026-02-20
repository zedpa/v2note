"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/features/chat/hooks/use-chat";
import { ChatBubble } from "./chat-bubble";

interface ChatViewProps {
  dateRange: { start: string; end: string };
  onClose: () => void;
}

export function ChatView({ dateRange, onClose }: ChatViewProps) {
  const { messages, send, streaming, connected, connect, disconnect } =
    useChat(dateRange);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    send(trimmed);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-secondary/60 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">复盘</p>
          <p className="text-[10px] text-muted-foreground">
            {dateRange.start} - {dateRange.end}
          </p>
        </div>
        {!connected && (
          <span className="text-[10px] text-amber-500">连接中...</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            streaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
          />
        ))}
      </div>

      {/* Input bar */}
      <div className="border-t border-border/60 px-4 py-3 pb-safe shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入你的想法..."
            rows={1}
            className="flex-1 bg-card border border-border/60 rounded-xl px-4 py-2.5 text-sm outline-none resize-none placeholder:text-muted-foreground/50 max-h-24"
            style={{ minHeight: "40px" }}
            disabled={streaming}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0",
              input.trim() && !streaming
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/40 text-muted-foreground",
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
