"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, Mic, Send, Camera, Image, FileText, Link, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Attachment {
  type: "image" | "file";
  name: string;
  // placeholder — will hold Capacitor file reference later
  data?: unknown;
}

interface UnifiedInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { type: string; content?: string; file?: unknown }) => void;
  onRecordPress: () => void;
}

export function UnifiedInput({
  isOpen,
  onClose,
  onSubmit,
  onRecordPress,
}: UnifiedInputProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── visualViewport: keep sheet above keyboard ──
  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setText("");
      setAttachment(null);
      setDetectedUrl(null);
      setShowActions(false);
    }
  }, [isOpen]);

  // Auto-focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isOpen]);

  // Detect URL in text
  useEffect(() => {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    setDetectedUrl(urlMatch ? urlMatch[0] : null);
  }, [text]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    if (attachment) {
      onSubmit({
        type: attachment.type,
        content: trimmed || undefined,
        file: attachment.data,
      });
    } else {
      onSubmit({ type: "text", content: trimmed });
    }

    setText("");
    setAttachment(null);
    setDetectedUrl(null);
    onClose();
  }, [text, attachment, onSubmit, onClose]);

  const handleImportUrl = useCallback(() => {
    if (!detectedUrl) return;
    onSubmit({ type: "url", content: detectedUrl });
    setText("");
    setDetectedUrl(null);
    onClose();
  }, [detectedUrl, onSubmit, onClose]);

  const handleActionSelect = useCallback(
    (action: "camera" | "gallery" | "file") => {
      setShowActions(false);
      switch (action) {
        case "camera":
          console.log("[UnifiedInput] 拍照 — Capacitor Camera placeholder");
          setAttachment({ type: "image", name: "拍照图片" });
          break;
        case "gallery":
          console.log("[UnifiedInput] 从相册选择 — Capacitor Camera placeholder");
          setAttachment({ type: "image", name: "相册图片" });
          break;
        case "file":
          console.log("[UnifiedInput] 选择文件 — Capacitor FilePicker placeholder");
          setAttachment({ type: "file", name: "选择的文件" });
          break;
      }
    },
    [],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => {
          setShowActions(false);
          onClose();
        }}
      />

      {/* Action sheet for attachment options */}
      {showActions && (
        <div
          className="fixed inset-0 z-[52] bg-black/30"
          onClick={() => setShowActions(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-cream rounded-t-2xl animate-slide-up-sheet"
            style={{ bottom: `${bottomOffset}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-brand-border" />
            </div>
            <div className="px-4 pt-1 pb-4 pb-safe space-y-1">
              <button
                type="button"
                onClick={() => handleActionSelect("camera")}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-bark hover:bg-sand transition-colors"
              >
                <Camera className="w-5 h-5 text-deer" />
                <span className="text-sm">拍照</span>
              </button>
              <button
                type="button"
                onClick={() => handleActionSelect("gallery")}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-bark hover:bg-sand transition-colors"
              >
                <Image className="w-5 h-5 text-deer" />
                <span className="text-sm">从相册选择</span>
              </button>
              <button
                type="button"
                onClick={() => handleActionSelect("file")}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-bark hover:bg-sand transition-colors"
              >
                <FileText className="w-5 h-5 text-deer" />
                <span className="text-sm">选择文件</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <div
        className="fixed left-0 right-0 z-50 bg-cream rounded-t-2xl border-t border-brand-border shadow-2xl backdrop-blur animate-slide-up-sheet"
        style={{ bottom: `${bottomOffset}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-brand-border" />
        </div>

        <div className="px-4 pt-1 pb-4 pb-safe">
          {/* Attachment preview */}
          {attachment && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-sand">
              {attachment.type === "image" ? (
                <Image className="w-4 h-4 text-deer shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-deer shrink-0" />
              )}
              <span className="text-sm text-bark flex-1 truncate">
                {attachment.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-deer hover:text-antler transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* URL preview */}
          {detectedUrl && !attachment && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-sand">
              <Link className="w-4 h-4 text-deer shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-bark">链接已识别</p>
                <p className="text-xs text-deer truncate">{detectedUrl}</p>
              </div>
              <button
                type="button"
                onClick={handleImportUrl}
                className="text-xs px-2.5 py-1 rounded-full bg-deer text-cream font-medium shrink-0 hover:bg-antler transition-colors"
              >
                导入内容
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2">
            {/* Attach button */}
            <button
              type="button"
              onClick={() => setShowActions(true)}
              className="flex items-center justify-center w-9 h-9 shrink-0 text-deer hover:text-antler transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Textarea */}
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
              placeholder="输入或粘贴..."
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-bark leading-relaxed outline-none placeholder:text-deer/40 max-h-40 py-1"
              style={{ minHeight: "36px" }}
            />

            {/* Record / Send button */}
            {text.trim() || attachment ? (
              <button
                type="button"
                onClick={handleSubmit}
                className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 bg-deer text-cream hover:bg-antler transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordPress();
                }}
                className="flex items-center justify-center w-9 h-9 shrink-0 text-deer hover:text-antler transition-colors"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
