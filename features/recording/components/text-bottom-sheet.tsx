"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, Paperclip, Camera, Image, FileText, Link, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { executeCommand, getCommandDefs } from "@/features/commands/lib/registry";
import type { CommandContext } from "@/features/commands/lib/registry";
import { createManualNote } from "@/features/notes/lib/manual-note";
import { emit } from "@/features/recording/lib/events";
import { fabNotify } from "@/shared/lib/fab-notify";
import { api } from "@/shared/lib/api";
import { startAiPipeline, renewAiPipeline } from "@/shared/lib/ai-processing";

/** 可用技能定义（用于技能面板） */
const AVAILABLE_SKILLS = [
  { name: "review-guide", label: "复盘", description: "深度复盘引导" },
  { name: "todo-management", label: "拆解待办", description: "目标/项目拆解为待办" },
  { name: "munger-review", label: "芒格视角", description: "芒格决策框架分析" },
  { name: "meta-question", label: "元问题", description: "深度分析问题本质" },
  { name: "second-order-thinking", label: "二阶思考", description: "分析问题背后的问题" },
];

interface TextBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  onCommandMode?: (text: string) => void;
  onSkillSelect?: (skillName: string) => void;
  commandContext?: Partial<CommandContext>;
  activeNotebook?: string | null;
  /** Called when mic button is tapped — closes sheet and starts recording */
  onRecordPress?: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function TextBottomSheet({
  open,
  onClose,
  onStartReview,
  onCommandMode,
  onSkillSelect,
  commandContext,
  activeNotebook,
  onRecordPress,
}: TextBottomSheetProps) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [showSkillPanel, setShowSkillPanel] = useState(false);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; file: File } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setShowActions(false);
      setShowSkillPanel(false);
      setDetectedUrl(null);
      setAttachment(null);
    }
  }, [open]);

  // Command suggestions
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

  // Detect URL in text
  useEffect(() => {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    setDetectedUrl(urlMatch ? urlMatch[0] : null);
  }, [text]);

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // "/" alone → 打开技能面板
    if (/^\/\s*$/.test(value)) {
      setText("");
      setShowSkillPanel(true);
      return;
    }

    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();

    // Handle attachment upload
    if (attachment) {
      setSubmitting(true);
      onClose();
      const pid = startAiPipeline();
      try {
        const base64 = await fileToBase64(attachment.file);
        const isImage = attachment.file.type.startsWith("image/");
        if (isImage) {
          await api.post("/api/v1/ingest", {
            type: "image",
            file_base64: base64,
            source_type: "material",
          });
          fabNotify.info("图片已收录");
        } else {
          await api.post("/api/v1/ingest", {
            type: "file",
            file_base64: base64,
            filename: attachment.name,
            mimeType: attachment.file.type,
            source_type: "material",
          });
          fabNotify.info(`${attachment.name} 已收录`);
        }
        renewAiPipeline(pid); // 后台 digest 可能还在跑
        emit("recording:processed");
      } catch {
        fabNotify.error("上传失败");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!trimmed || submitting) return;

    // "/" alone → 打开技能面板
    if (/^\/\s*$/.test(trimmed) || trimmed === "/") {
      setText("");
      setShowSkillPanel(true);
      return;
    }

    const ctx: CommandContext = {
      ...commandContext,
      startReview: onStartReview,
    };
    const cmdResult = executeCommand(trimmed, ctx);
    if (cmdResult) {
      if (cmdResult.message) fabNotify.info(cmdResult.message);
      setText("");
      onClose();
      return;
    }

    // Normal text → create manual note
    setSubmitting(true);
    setText("");
    onClose();
    const pid = startAiPipeline();
    try {
      await createManualNote({ content: trimmed, useAi: true, notebook: activeNotebook ?? undefined });
      fabNotify.success("已保存");
      renewAiPipeline(pid); // 后台 process + digest + todo 投影还在跑
      emit("recording:processed");
    } catch (err: any) {
      fabNotify.error(`保存失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, attachment, commandContext, onStartReview, onClose, onCommandMode, activeNotebook]);

  const handleImportUrl = useCallback(() => {
    if (!detectedUrl) return;
    setSubmitting(true);
    onClose();
    const pid = startAiPipeline();
    api
      .post("/api/v1/ingest", { type: "url", content: detectedUrl, source_type: "material" })
      .then(() => {
        fabNotify.info("链接已收录");
        renewAiPipeline(pid);
        emit("recording:processed");
      })
      .catch(() => fabNotify.error("链接提取失败"))
      .finally(() => setSubmitting(false));
  }, [detectedUrl, onClose]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachment({ name: file.name, file });
      setShowActions(false);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  const hasContent = text.trim() || attachment;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.docx,.xlsx,.txt,.md,.csv"
        onChange={handleFileSelect}
      />

      {/* Action sheet for attachment options */}
      {open && showActions && (
        <div
          className="fixed inset-0 z-[52] bg-black/30"
          onClick={() => setShowActions(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl animate-slide-up-sheet"
            style={{ bottom: `${bottomOffset}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
            </div>
            <div className="px-4 pt-1 pb-4 pb-safe space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowActions(false);
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setAttachment({ name: file.name, file });
                  };
                  input.click();
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-foreground hover:bg-secondary transition-colors"
              >
                <Camera className="w-5 h-5 text-primary" />
                <span className="text-sm">拍照</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowActions(false);
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setAttachment({ name: file.name, file });
                  };
                  input.click();
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-foreground hover:bg-secondary transition-colors"
              >
                <Image className="w-5 h-5 text-primary" />
                <span className="text-sm">从相册选择</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowActions(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-foreground hover:bg-secondary transition-colors"
              >
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-sm">选择文件</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet */}
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
          {/* Skill panel — "/" 触发 */}
          {showSkillPanel && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-2">选择技能开始对话</p>
              <div className="flex gap-2 flex-wrap">
                {AVAILABLE_SKILLS.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    onClick={() => {
                      setShowSkillPanel(false);
                      onSkillSelect?.(skill.name);
                    }}
                    className="px-3 py-1.5 rounded-full bg-deer/10 text-deer text-xs font-medium hover:bg-deer/20 transition-colors"
                  >
                    {skill.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Command suggestions */}
          {suggestions.length > 0 && !showSkillPanel && (
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

          {/* Attachment preview */}
          {attachment && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-secondary">
              {attachment.file.type.startsWith("image/") ? (
                <Image className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-primary shrink-0" />
              )}
              <span className="text-sm text-foreground flex-1 truncate">
                {attachment.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* URL preview */}
          {detectedUrl && !attachment && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-secondary">
              <Link className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">链接已识别</p>
                <p className="text-xs text-primary truncate">{detectedUrl}</p>
              </div>
              <button
                type="button"
                onClick={handleImportUrl}
                className="text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-medium shrink-0"
              >
                导入
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Attach button */}
            <button
              type="button"
              onClick={() => setShowActions(true)}
              className="flex items-center justify-center w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>

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

            {/* Mic / Send button */}
            {hasContent ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors",
                  "bg-primary text-primary-foreground",
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordPress?.();
                }}
                className="flex items-center justify-center w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}
