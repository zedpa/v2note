"use client";

import { cn } from "@/lib/utils";
import { PixelDeer } from "./pixel-deer";
import { useCompanion } from "../hooks/use-companion";
import { DEER_STATUS_TEXT } from "../lib/deer-states";
import { AnimatePresence, motion } from "framer-motion";

interface AiWindowProps {
  onOpenChat?: (initial?: string) => void;
  onOpenOverlay?: (name: string) => void;
  onAction?: (action: string) => void;
}

/**
 * AI 伴侣窗口 — 常驻 header 下方，56px 高
 * 三态：静默态 / 气泡态 / 对话态（点击→overlay）
 */
export function AiWindow({ onOpenChat, onOpenOverlay, onAction }: AiWindowProps) {
  const {
    deerState,
    statusText,
    mood,
    moodText,
    pendingMessage,
    windowMode,
    dismissMessage,
  } = useCompanion();

  const displayText = pendingMessage?.text || statusText || DEER_STATUS_TEXT[deerState] || "";

  const handleClick = () => {
    if (pendingMessage) {
      // 气泡态：如果有消息，携带消息进入对话
      onOpenChat?.(pendingMessage.text);
      dismissMessage();
    } else {
      // 静默态：直接打开对话
      onOpenChat?.();
    }
  };

  const handleAction = (action: string) => {
    onAction?.(action);
    dismissMessage();
  };

  // 消息类型对应的左侧竖线颜色
  const accentColor = pendingMessage?.accentColor
    || (pendingMessage?.type === "action.confirm" ? "#E8A87C"     // dawn
      : pendingMessage?.type === "action.result" ? "#5C7A5E"      // forest
      : undefined);

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative flex items-center gap-3 px-4 cursor-pointer select-none transition-all duration-200",
        windowMode === "bubble" ? "min-h-[56px] py-2" : "h-[56px]",
      )}
      role="button"
      tabIndex={0}
      aria-label={`路路: ${displayText || "点击打开对话"}`}
    >
      {/* 消息类型竖线 */}
      {accentColor && (
        <div
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* 像素小鹿 */}
      <PixelDeer state={deerState} size={32} className="shrink-0" />

      {/* 文字区域 */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={displayText}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {displayText ? (
              <p className={cn(
                "text-sm leading-relaxed",
                windowMode === "bubble"
                  ? "text-on-surface"
                  : "text-muted-accessible text-xs font-mono",
              )}>
                {displayText}
              </p>
            ) : (
              <p className="text-xs text-muted-accessible/40 font-mono">
                {moodText}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 气泡态操作按钮 */}
        {windowMode === "bubble" && pendingMessage?.actions && (
          <div className="flex items-center gap-2 mt-1.5">
            {pendingMessage.actions.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(a.action);
                }}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  a.action === "confirm"
                    ? "bg-deer text-white"
                    : "bg-surface-high text-muted-accessible",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
