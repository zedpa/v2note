"use client";

import { useRef, useCallback, useEffect } from "react";
import { Send, Mic, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStartRecording?: () => void;
  disabled?: boolean;
  placeholder?: string;
  deepThinkEnabled?: boolean;
  onToggleDeepThink?: () => void;
}

export function ChatInputBar({
  value,
  onChange,
  onSend,
  onStartRecording,
  disabled = false,
  placeholder = "输入你的想法...",
  deepThinkEnabled = false,
  onToggleDeepThink,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasContent = value.trim().length > 0;

  // Auto-grow textarea up to 4 lines
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // ~20px per line * 4 lines = 80px max, plus padding
    const maxHeight = 96;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (hasContent && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="sticky bottom-0 px-4 py-3 pb-safe shrink-0 bg-surface/90 backdrop-blur-xl border-t border-brand-border/40 shadow-[0_-4px_20px_var(--shadow-ambient)]">
      <div className="flex items-end gap-2">
        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-surface-lowest rounded-full px-4 py-2.5 text-sm text-on-surface outline-none resize-none placeholder:text-muted-accessible/50 max-h-24"
          style={{ minHeight: "40px" }}
        />

        {/* Deep think toggle */}
        {onToggleDeepThink && (
          <button
            type="button"
            onClick={onToggleDeepThink}
            disabled={disabled}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full transition-all shrink-0",
              deepThinkEnabled
                ? "text-deer animate-breathe"
                : "text-muted-accessible hover:text-on-surface",
            )}
            aria-label={deepThinkEnabled ? "关闭深度思考" : "开启深度思考"}
          >
            <Brain size={18} />
          </button>
        )}

        {/* Voice recording */}
        {onStartRecording && (
          <button
            type="button"
            onClick={onStartRecording}
            disabled={disabled || hasContent}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0",
              hasContent
                ? "text-muted-accessible/30"
                : "text-muted-accessible hover:text-on-surface",
            )}
            aria-label="语音输入"
          >
            <Mic size={18} />
          </button>
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!hasContent || disabled}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0",
            hasContent && !disabled
              ? "text-white"
              : "bg-surface-high text-muted-accessible",
          )}
          style={
            hasContent && !disabled
              ? { background: "linear-gradient(135deg, #89502C, #C8845C)" }
              : undefined
          }
          aria-label="发送"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
