"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/features/chat/hooks/use-chat";
import { ChatBubble } from "./chat-bubble";
import { SwipeBack } from "@/shared/components/swipe-back";
import { executeCommand, getCommandDefs, type CommandContext } from "@/features/commands/lib/registry";

interface ChatViewProps {
  dateRange: { start: string; end: string };
  onClose: () => void;
  initialMessage?: string;
  title?: string;
  commandContext?: Partial<CommandContext>;
}

export function ChatView({ dateRange, onClose, initialMessage, title, commandContext }: ChatViewProps) {
  const { messages, send, streaming, connected, connect, disconnect } =
    useChat(dateRange, {
      mode: initialMessage ? "command" : "review",
      initialMessage,
    });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Detect if the command list is showing (last assistant message contains command list)
  const commandDefs = useMemo(() => getCommandDefs(), []);
  const showCommandChips = useMemo(() => {
    if (!initialMessage) return false;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.content?.includes("可用命令如下") ?? false;
  }, [messages, initialMessage]);

  const handleCommandChip = useCallback((name: string) => {
    const text = `/${name}`;
    // Try local command execution first (e.g. /todos, /search open overlays)
    if (commandContext) {
      const result = executeCommand(text, commandContext);
      if (result?.handled) return;
    }
    // Not a local command — send to gateway
    send(text);
  }, [send, commandContext]);

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

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    // In command mode, try to execute local commands first
    if (initialMessage && commandContext && trimmed.startsWith("/")) {
      const result = executeCommand(trimmed, commandContext);
      if (result?.handled) {
        setInput("");
        // Don't call onClose — openOverlay already switches activeOverlay,
        // which unmounts ChatView. Calling onClose would reset it to null.
        return;
      }
    }

    send(trimmed);
    setInput("");
    inputRef.current?.focus();
  }, [input, streaming, initialMessage, commandContext, send]);

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
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
            <p className="text-sm font-semibold text-foreground">
              {title ?? (initialMessage ? "指令模式" : "复盘")}
            </p>
            {!initialMessage && (
              <p className="text-[10px] text-muted-foreground">
                {dateRange.start} - {dateRange.end}
              </p>
            )}
            {initialMessage && (
              <p className="text-[10px] text-muted-foreground">
                通过对话修改设置、提示词、记忆等
              </p>
            )}
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

          {/* Clickable command chips */}
          {showCommandChips && !streaming && (
            <div className="flex flex-wrap gap-2 mt-2 mb-3">
              {commandDefs.map((cmd) => (
                <button
                  key={cmd.name}
                  type="button"
                  onClick={() => handleCommandChip(cmd.name)}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  /{cmd.name}
                </button>
              ))}
            </div>
          )}
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
    </SwipeBack>
  );
}
