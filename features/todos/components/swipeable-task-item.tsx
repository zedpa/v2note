"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { Clock, Trash2, Check } from "lucide-react";
import type { TodoDTO } from "../lib/todo-types";
import { TaskItem } from "./task-item";
import { hapticsImpactLight, hapticsNotifySuccess, hapticsNotifyWarning } from "@/shared/lib/haptics";

const LEFT_THRESHOLD = 60;   // 左滑吸附阈值
const RIGHT_THRESHOLD = 80;  // 右滑完成阈值
const ACTION_WIDTH = 120;    // 左滑操作区宽度

interface SwipeableTaskItemProps {
  todo: TodoDTO;
  onToggle: (id: string) => void;
  onPress?: (todo: TodoDTO) => void;
  onPostpone: (id: string) => void;
  onRemove: (id: string) => void;
  /** 当前打开的卡片 ID，用于互斥关闭 */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}

type Phase = "idle" | "swiping" | "open";

export function SwipeableTaskItem({
  todo,
  onToggle,
  onPress,
  onPostpone,
  onRemove,
  openId,
  onOpenChange,
}: SwipeableTaskItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transitioning, setTransitioning] = useState(false);

  const touchRef = useRef<{
    startX: number;
    startY: number;
    locked: "h" | "v" | null;
    hapticFired: boolean;
  } | null>(null);

  // 使用 ref 保持回调最新值，避免 useEffect 频繁重绑
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const offsetRef = useRef(offsetX);
  offsetRef.current = offsetX;

  // 互斥：其他卡片打开时关闭自己
  useEffect(() => {
    if (openId !== todo.id && phase === "open") {
      setTransitioning(true);
      setOffsetX(0);
      setPhase("idle");
    }
  }, [openId, todo.id, phase]);

  // 原生 touch 事件注册（non-passive，允许 preventDefault）
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      touchRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        locked: null,
        hapticFired: false,
      };
      setTransitioning(false);
    };

    const onMove = (e: TouchEvent) => {
      const t = touchRef.current;
      if (!t) return;

      const dx = e.touches[0].clientX - t.startX;
      const dy = e.touches[0].clientY - t.startY;

      if (!t.locked) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          t.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
        if (t.locked !== "h") return;
      }
      if (t.locked !== "h") return;

      e.preventDefault(); // 非 passive，可以阻止滚动

      let rawOffset = phaseRef.current === "open" ? -ACTION_WIDTH + dx : dx;

      if (rawOffset > 0 && todo.done) rawOffset = 0;
      if (rawOffset > RIGHT_THRESHOLD * 1.5) rawOffset = RIGHT_THRESHOLD * 1.5;
      if (rawOffset < -ACTION_WIDTH * 1.2) rawOffset = -ACTION_WIDTH * 1.2;

      if (!t.hapticFired) {
        if (rawOffset < -LEFT_THRESHOLD || rawOffset > RIGHT_THRESHOLD) {
          t.hapticFired = true;
          void hapticsImpactLight();
        }
      }

      setOffsetX(rawOffset);
      setPhase("swiping");
    };

    const onEnd = () => {
      const t = touchRef.current;
      touchRef.current = null;

      if (!t || t.locked !== "h") {
        if (phaseRef.current === "swiping") {
          setTransitioning(true);
          setOffsetX(0);
          setPhase("idle");
        }
        return;
      }

      setTransitioning(true);
      const cur = offsetRef.current;

      if (cur > RIGHT_THRESHOLD && !todo.done) {
        setOffsetX(0);
        setPhase("idle");
        onOpenChange(null);
        void hapticsNotifySuccess();
        onToggle(todo.id);
      } else if (cur < -LEFT_THRESHOLD) {
        setOffsetX(-ACTION_WIDTH);
        setPhase("open");
        onOpenChange(todo.id);
      } else {
        setOffsetX(0);
        setPhase("idle");
        if (phaseRef.current === "open") onOpenChange(null);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [todo.done, todo.id, onToggle, onOpenChange]);

  const handlePostpone = useCallback(() => {
    setTransitioning(true);
    setOffsetX(0);
    setPhase("idle");
    onOpenChange(null);
    onPostpone(todo.id);
  }, [todo.id, onPostpone, onOpenChange]);

  const handleRemove = useCallback(() => {
    void hapticsNotifyWarning();
    setTransitioning(true);
    setOffsetX(0);
    setPhase("idle");
    onOpenChange(null);
    onRemove(todo.id);
  }, [todo.id, onRemove, onOpenChange]);

  // 右滑完成区域的透明度
  const rightReveal = Math.min(1, Math.max(0, offsetX / RIGHT_THRESHOLD));
  // 左滑操作区的透明度
  const leftReveal = Math.min(1, Math.max(0, -offsetX / LEFT_THRESHOLD));

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl"
      data-testid="swipeable-task-item"
    >
      {/* 右滑完成底层（绿色） */}
      <div
        className="absolute inset-0 flex items-center px-4 bg-emerald-500 dark:bg-emerald-600 rounded-xl"
        style={{ opacity: rightReveal }}
      >
        <Check className="h-6 w-6 text-white" />
        <span className="ml-2 text-sm font-medium text-white">完成</span>
      </div>

      {/* 左滑操作底层 */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch rounded-r-xl"
        style={{ width: ACTION_WIDTH, opacity: leftReveal }}
      >
        <button
          onClick={handlePostpone}
          className="flex flex-1 flex-col items-center justify-center bg-amber-500 dark:bg-amber-500 text-white text-xs gap-1"
        >
          <Clock className="h-4 w-4" />
          推迟
        </button>
        <button
          onClick={handleRemove}
          className="flex flex-1 flex-col items-center justify-center bg-red-500 dark:bg-red-500 text-white text-xs gap-1 rounded-r-xl"
        >
          <Trash2 className="h-4 w-4" />
          删除
        </button>
      </div>

      {/* 前景卡片 */}
      <div
        ref={cardRef}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: transitioning ? "transform 0.25s ease-out" : "none",
        }}
        onTransitionEnd={() => setTransitioning(false)}
      >
        <TaskItem todo={todo} onToggle={onToggle} onPress={onPress} />
      </div>
    </div>
  );
}
