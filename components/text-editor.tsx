"use client";

import { useState, useRef, useCallback } from "react";
import { X, Tag, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { createManualNote } from "@/lib/manual-note";
import { useTags } from "@/hooks/use-tags";
import { toast } from "sonner";
import { SwipeBack } from "./swipe-back";

interface TextEditorProps {
  onClose: () => void;
}

const LONG_PRESS_MS = 600;

export function TextEditor({ onClose }: TextEditorProps) {
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const { tags } = useTags();
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const didLongPress = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = useCallback(
    async (useAi: boolean) => {
      if (!content.trim()) {
        toast.error("请输入内容");
        return;
      }

      try {
        setSaving(true);
        await createManualNote({
          content: content.trim(),
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          useAi,
        });
        toast(useAi ? "笔记已创建，AI 正在分析..." : "笔记已创建");
        onClose();
      } catch (err: any) {
        toast.error(`保存失败: ${err.message}`);
      } finally {
        setSaving(false);
      }
    },
    [content, selectedTags, onClose],
  );

  // Long press send → AI analysis, short press → direct save
  const handleSendTouchStart = () => {
    didLongPress.current = false;
    longPressRef.current = setTimeout(() => {
      didLongPress.current = true;
      handleSave(true);
    }, LONG_PRESS_MS);
  };

  const handleSendTouchEnd = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    if (!didLongPress.current) {
      handleSave(false);
    }
  };

  const handleSendTouchCancel = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    didLongPress.current = false;
  };

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col h-dvh max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-background/80 backdrop-blur-xl z-10 pt-safe border-b border-border/50">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h1 className="text-lg font-bold text-foreground">新建笔记</h1>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Selected tags display */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selectedTags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {tag} &times;
                </button>
              ))}
            </div>
          )}

          {/* Hint text */}
          <p className="text-xs text-muted-foreground/50 mb-2">
            短按发送 = 直接保存 · 长按发送 = AI分析
          </p>
        </div>

        {/* Tag picker panel */}
        {showTagPicker && (
          <div className="border-t border-border/30 bg-secondary/30 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    selectedTags.includes(tag)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom input bar */}
        <div className="border-t border-border/50 bg-card px-3 py-2 pb-safe">
          <div className="flex items-end gap-2">
            {/* Tag toggle button */}
            <button
              type="button"
              onClick={() => setShowTagPicker(!showTagPicker)}
              className={cn(
                "flex-shrink-0 p-2 rounded-full transition-colors",
                showTagPicker
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary",
              )}
              aria-label="选择标签"
            >
              <Tag className="w-5 h-5" />
            </button>

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                // Auto-resize
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
              placeholder="写下你的想法..."
              rows={1}
              className="flex-1 px-3.5 py-2 rounded-2xl bg-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed max-h-[120px]"
            />

            {/* Send button */}
            <button
              type="button"
              disabled={saving || !content.trim()}
              onTouchStart={handleSendTouchStart}
              onTouchEnd={handleSendTouchEnd}
              onTouchCancel={handleSendTouchCancel}
              onMouseDown={handleSendTouchStart}
              onMouseUp={handleSendTouchEnd}
              onMouseLeave={handleSendTouchCancel}
              className={cn(
                "flex-shrink-0 p-2.5 rounded-full transition-colors",
                content.trim()
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground",
                saving && "opacity-50 pointer-events-none",
              )}
              aria-label="发送"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </SwipeBack>
  );
}
