"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionCard } from "@/shared/lib/api/action-panel";
import { reportSwipe } from "@/shared/lib/api/action-panel";
import { motion, useSpring, useMotionValue, AnimatePresence } from "framer-motion";

const ACTION_ICONS: Record<string, string> = {
  call: "\u{1F4DE}",
  write: "\u{1F4DD}",
  review: "\u{1F441}",
  think: "\u{1F4AD}",
  record: "\u{1F399}",
};

type SkipReason = "wait" | "blocked" | "rethink";

interface NowCardProps {
  card: ActionCard;
  onComplete: (strikeId: string) => void;
  onSkip: (strikeId: string, reason?: SkipReason) => void;
  onTraverse?: (strikeId: string) => void;
  onReflect?: (strikeId: string) => void;
}

type SwipePhase = "idle" | "swiping";

const SKIP_OPTIONS: { reason: SkipReason; icon: string; label: string }[] = [
  { reason: "wait", icon: "\u23F3", label: "\u7B49\u6761\u4EF6" },
  { reason: "blocked", icon: "\u{1F6A7}", label: "\u6709\u963B\u529B" },
  { reason: "rethink", icon: "\u{1F504}", label: "\u8981\u91CD\u60F3" },
];

export function NowCard({ card, onComplete, onSkip, onTraverse, onReflect }: NowCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [phase, setPhase] = useState<SwipePhase>("idle");
  const [showSkipSheet, setShowSkipSheet] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const widthRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<SwipePhase>("idle");

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);

  const setPhaseSync = useCallback((p: SwipePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // framer-motion spring 驱动
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  const springX = useSpring(motionX, { stiffness: 300, damping: 25 });
  const springY = useSpring(motionY, { stiffness: 300, damping: 25 });

  // 粒子状态 (场景 7.3)
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; angle: number; speed: number }>>([]);

  const resetCard = useCallback(() => {
    motionX.set(0);
    motionY.set(0);
    setOffsetX(0);
    setPhaseSync("idle");
  }, [setPhaseSync, motionX, motionY]);

  const spawnParticles = useCallback(() => {
    // 检查 prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const count = 10;
    const ps = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: 0,
      y: 0,
      angle: (Math.random() - 0.3) * Math.PI, // 偏右散射
      speed: 60 + Math.random() * 80,
    }));
    setParticles(ps);
    setTimeout(() => setParticles([]), 500);
  }, []);

  const flyOut = useCallback(
    (direction: "left" | "right", cb: () => void) => {
      const target = direction === "right" ? widthRef.current * 1.2 : -widthRef.current * 1.2;
      motionX.set(target);
      setOffsetX(target);
      if (direction === "right") spawnParticles();
      setTimeout(() => {
        cb();
        motionX.jump(0);
        motionY.jump(0);
        setOffsetX(0);
        setPhaseSync("idle");
      }, 300);
    },
    [setPhaseSync, motionX, motionY, spawnParticles],
  );

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Action Sheet 选择原因
  const handleSkipReason = useCallback((reason: SkipReason) => {
    setShowSkipSheet(false);
    reportSwipe({ strikeId: card.strikeId, direction: "left", reason });
    onSkip(card.strikeId, reason);
  }, [card.strikeId, onSkip]);

  // Action Sheet 取消
  const handleSkipCancel = useCallback(() => {
    setShowSkipSheet(false);
    reportSwipe({ strikeId: card.strikeId, direction: "left", reason: "later" });
    onSkip(card.strikeId);
  }, [card.strikeId, onSkip]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current !== "idle" || showSkipSheet) return;
      const el = containerRef.current;
      if (!el) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      widthRef.current = el.offsetWidth;
      longPressFiredRef.current = false;

      clearLongPress();
      if (onTraverse) {
        longPressTimerRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          onTraverse(card.strikeId);
        }, 500);
      }

      setPhaseSync("swiping");
    },
    [setPhaseSync, clearLongPress, onTraverse, card.strikeId, showSkipSheet],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current !== "swiping") return;

      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;

      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearLongPress();
      }

      setOffsetX(dx);
      motionX.set(dx);
    },
    [clearLongPress, motionX],
  );

  const onPointerUp = useCallback(
    (_e: React.PointerEvent) => {
      clearLongPress();
      const p = phaseRef.current;
      if (p === "idle") return;

      if (longPressFiredRef.current) {
        resetCard();
        return;
      }

      const ratio = Math.abs(offsetX) / (widthRef.current || 1);

      // Right swipe > 40% = complete
      if (offsetX > 0 && ratio > 0.4) {
        reportSwipe({ strikeId: card.strikeId, direction: "right" });
        flyOut("right", () => onComplete(card.strikeId));
        return;
      }

      // Left swipe > 40% (or > 80px) = fly out + show Action Sheet
      if (offsetX < 0 && (ratio > 0.4 || Math.abs(offsetX) > 80)) {
        flyOut("left", () => {
          setShowSkipSheet(true);
        });
        return;
      }

      resetCard();
    },
    [offsetX, card.strikeId, onComplete, flyOut, resetCard, clearLongPress],
  );

  const onPointerCancel = useCallback(() => {
    clearLongPress();
    resetCard();
  }, [resetCard, clearLongPress]);

  const ratio = widthRef.current ? Math.abs(offsetX) / widthRef.current : 0;
  const isRight = offsetX > 0;
  const icon = ACTION_ICONS[card.actionType] ?? "\u25B6";
  const showReflection = (card.skipCount ?? 0) >= 5;
  // 标签激活态：滑动距离 > 40px 时从半透明变为全不透明
  const labelActivated = Math.abs(offsetX) > 40;

  return (
    <div ref={containerRef} className="relative select-none touch-none">
      {/* 右滑背景：森林色 + 完成标签 */}
      <div
        className="absolute inset-0 rounded-2xl flex items-center justify-start px-6 bg-forest/15"
        style={{ opacity: isRight ? Math.min(ratio * 2, 1) : 0 }}
      >
        <div className={cn(
          "flex items-center gap-2 transition-opacity",
          labelActivated && isRight ? "opacity-100" : "opacity-50",
        )}>
          <div className="w-8 h-8 rounded-full bg-forest/30 flex items-center justify-center">
            <span className="text-forest text-lg">{"\u2713"}</span>
          </div>
          <span className="text-sm font-medium text-forest">{"\u5B8C\u6210"}</span>
        </div>
      </div>

      {/* 左滑背景：晨光色 + 跳过标签 */}
      <div
        className="absolute inset-0 rounded-2xl flex items-center justify-end px-6 bg-dawn/15"
        style={{ opacity: !isRight && ratio > 0 ? Math.min(ratio * 2, 1) : 0 }}
      >
        <div className={cn(
          "flex items-center gap-2 transition-opacity",
          labelActivated && !isRight ? "opacity-100" : "opacity-50",
        )}>
          <span className="text-sm font-medium text-dawn-dark">{"\u8DF3\u8FC7 \u2192"}</span>
        </div>
      </div>

      {/* 粒子效果 (场景 7.3) */}
      {particles.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute w-2 h-2 rounded-full bg-forest"
              initial={{ x: "50%", y: "50%", opacity: 1, scale: 1 }}
              animate={{
                x: `calc(50% + ${Math.cos(p.angle) * p.speed}px)`,
                y: `calc(50% + ${Math.sin(p.angle) * p.speed}px)`,
                opacity: 0,
                scale: 0.3,
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* Card — Editorial Serenity style, spring-driven */}
      <motion.div
        className="relative rounded-2xl bg-surface-lowest p-5 shadow-ambient-lg"
        style={{ x: springX, y: springY }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Goal name */}
        <div className="text-[11px] text-muted-accessible font-mono mb-1.5">{card.goalName}</div>

        {/* Action */}
        <div className="flex items-start gap-2.5">
          <span className="text-xl shrink-0 mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium text-on-surface leading-snug">{card.action}</div>
            {card.context && (
              <div className="text-sm text-muted-accessible mt-1">{card.context}</div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-accessible">
          {card.targetPerson && <span>{"\u2192"} {card.targetPerson}</span>}
          {card.durationEstimate && <span>{"\u23F1"} {card.durationEstimate}</span>}
        </div>

        {/* Scene 4: 反复跳过反思提示 */}
        {showReflection && (
          <div className="mt-3 pt-3 border-t border-surface-high">
            <p className="text-xs text-dawn mb-2">
              {"\u8FD9\u4EF6\u4E8B\u5DF2\u7ECF\u5728\u8FD9\u91CC\u597D\u4E00\u9635\u5B50\u4E86\uFF0C\u8981\u804A\u804A\u5417\uFF1F"}
            </p>
            {onReflect && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReflect(card.strikeId); }}
                className="flex items-center gap-1.5 text-xs text-deer hover:text-deer-dark transition-colors"
              >
                <MessageCircle size={12} />
                {"\u548C\u8DEF\u8DEF\u804A\u804A"}
              </button>
            )}
          </div>
        )}
      </motion.div>

      {/* Skip Action Sheet (底部弹出) */}
      <AnimatePresence>
        {showSkipSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/30 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSkipCancel}
            />
            {/* Sheet */}
            <motion.div
              className="fixed inset-x-0 z-50 bg-surface-lowest rounded-t-2xl shadow-ambient px-5 pt-5 pb-8"
              style={{ bottom: "var(--kb-offset, 0px)" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              <div className="flex flex-col gap-2">
                {SKIP_OPTIONS.map((opt) => (
                  <button
                    key={opt.reason}
                    type="button"
                    onClick={() => handleSkipReason(opt.reason)}
                    className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-surface-high/50 hover:bg-surface-high active:bg-surface-high transition-colors text-left"
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <span className="text-sm font-medium text-deer">{opt.label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSkipCancel}
                className="w-full mt-3 py-3 rounded-xl text-sm text-muted-accessible hover:bg-surface-high/30 transition-colors"
              >
                {"\u53D6\u6D88"}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
