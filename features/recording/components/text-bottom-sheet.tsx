"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { executeCommand, getCommandNames } from "@/features/commands/lib/registry";
import type { CommandContext } from "@/features/commands/lib/registry";
import { createManualNote } from "@/features/notes/lib/manual-note";
import { emit } from "@/features/recording/lib/events";
import { toast } from "sonner";

interface TextBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  commandContext?: Partial<CommandContext>;
}

export function TextBottomSheet({
  open,
  onClose,
  onStartReview,
  commandContext,
}: TextBottomSheetProps) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    } else {
      setText("");
      setSuggestions([]);
    }
  }, [open]);

  // Command autocomplete
  useEffect(() => {
    if (text.startsWith("/") && text.length > 1) {
      const partial = text.slice(1).toLowerCase();
      const matches = getCommandNames().filter((c) => c.startsWith(partial));
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  }, [text]);

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    // Check for commands
    const ctx: CommandContext = {
      ...commandContext,
      startReview: onStartReview,
    };
    const cmdResult = executeCommand(trimmed, ctx);
    if (cmdResult) {
      if (cmdResult.message) toast(cmdResult.message);
      setText("");
      onClose();
      return;
    }

    // Normal text → create manual note
    setSubmitting(true);
    setText("");
    onClose();
    try {
      toast("正在保存...");
      await createManualNote({ content: trimmed, useAi: true });
      toast("已保存");
      emit("recording:processed");
    } catch (err: any) {
      toast.error(`保存失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, commandContext, onStartReview, onClose]);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-w-lg mx-auto">
        <DrawerTitle className="sr-only">输入文字</DrawerTitle>
        <div className="px-4 pt-2 pb-4 pb-safe">
          {/* Command suggestions */}
          {suggestions.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {suggestions.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setText(`/${cmd} `)}
                  className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground"
                >
                  /{cmd}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="写点什么... 或输入 /命令"
              rows={1}
              className="flex-1 bg-transparent resize-none text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/40 max-h-40 py-1"
              style={{ minHeight: "36px" }}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors",
                text.trim()
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
