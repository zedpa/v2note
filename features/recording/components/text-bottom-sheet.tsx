"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { executeCommand, getCommandDefs } from "@/features/commands/lib/registry";
import type { CommandContext } from "@/features/commands/lib/registry";
import { createManualNote } from "@/features/notes/lib/manual-note";
import { emit } from "@/features/recording/lib/events";
import { toast } from "sonner";

interface TextBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  onCommandMode?: (text: string) => void;
  commandContext?: Partial<CommandContext>;
}

export function TextBottomSheet({
  open,
  onClose,
  onStartReview,
  onCommandMode,
  commandContext,
}: TextBottomSheetProps) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── visualViewport: keep sheet above keyboard ──
  useEffect(() => {
    if (!open) {
      setBottomOffset(0);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = window.innerHeight - vv.offsetTop - vv.height;
      setBottomOffset(Math.max(0, offset));
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBottomOffset(0);
    };
  }, [open]);

  // Clear state when closed
  useEffect(() => {
    if (!open) {
      setText("");
      setSuggestions([]);
    }
  }, [open]);

  // Command suggestions (not for "/" alone — that triggers command mode)
  useEffect(() => {
    if (text === "/") {
      setSuggestions([]);
      return;
    }
    if (text.startsWith("/") && text.length > 1) {
      const partial = text.slice(1).toLowerCase();
      const matches = getCommandDefs()
        .filter(
          (c) =>
            c.name.startsWith(partial) ||
            c.aliases.some((a) => a.toLowerCase().startsWith(partial)),
        )
        .map((c) => c.name);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  }, [text]);

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // "/" alone (+ optional trailing whitespace from Android IME) → command mode
    if (/^\/\s*$/.test(value)) {
      onCommandMode?.("/");
      onClose();
      return;
    }

    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [onCommandMode, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    // "/" alone → command mode
    if (/^\/\s*$/.test(trimmed) || trimmed === "/") {
      onCommandMode?.("/");
      onClose();
      return;
    }

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
  }, [text, submitting, commandContext, onStartReview, onClose, onCommandMode]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Sheet — conditionally rendered for reliable Android display */}
      {open && (
      <div
        className="fixed left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl animate-slide-up-sheet"
        style={{ bottom: `${bottomOffset}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
        </div>

        <div className="px-4 pt-1 pb-4 pb-safe">
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
              autoFocus
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
      </div>
      )}
    </>
  );
}
