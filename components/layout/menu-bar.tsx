"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { cn } from "@/lib/utils";

type Scene = "write" | "timeline" | "map" | "goals";

interface MenuBarProps {
  currentScene: Scene;
  onSceneChange: (scene: Scene) => void;
  onAction: (action: string) => void;
  hasNewReport?: boolean;
}

const scenes: { key: Scene; label: string }[] = [
  { key: "write", label: "写作" },
  { key: "timeline", label: "时间线" },
  { key: "map", label: "地图" },
  { key: "goals", label: "目标" },
];

const actions: { emoji: string; label: string; action: string }[] = [
  { emoji: "🔍", label: "", action: "搜索" },
  { emoji: "🎙", label: "", action: "语音" },
  { emoji: "⚡️", label: "行动", action: "行动" },
  { emoji: "📋", label: "回顾", action: "回顾" },
  { emoji: "⚙️", label: "", action: "设置" },
];

export function MenuBar({
  currentScene,
  onSceneChange,
  onAction,
  hasNewReport = false,
}: MenuBarProps) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setVisible(true);
  }, []);

  const hideAfterDelay = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 400);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY <= 48) {
        show();
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [show]);

  return (
    <div
      ref={barRef}
      onMouseEnter={show}
      onMouseLeave={hideAfterDelay}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 h-11",
        "bg-cream/95 backdrop-blur border-b border-brand-border",
        "flex items-center justify-between px-3",
        "transition-all duration-300 ease-out",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-full pointer-events-none"
      )}
    >
      {/* Left: Logo + brand + scenes */}
      <div className="flex items-center gap-2">
        <LuluLogo size={24} />
        <span className="font-serif text-sm text-bark font-bold select-none">
          念念有路
        </span>
        <div className="flex items-center gap-0.5 ml-2">
          {scenes.map((s) => (
            <button
              key={s.key}
              onClick={() => onSceneChange(s.key)}
              className={cn(
                "px-2 py-1 rounded-lg text-sm transition",
                "hover:bg-sand",
                currentScene === s.key
                  ? "font-bold text-bark"
                  : "text-bark/50"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-0.5">
        {actions.map((a) => (
          <button
            key={a.action}
            onClick={() => onAction(a.action)}
            className="relative px-2 py-1 rounded-lg text-sm hover:bg-sand transition"
          >
            {a.emoji}
            {a.label && <span className="ml-0.5">{a.label}</span>}
            {a.action === "回顾" && hasNewReport && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-deer" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
