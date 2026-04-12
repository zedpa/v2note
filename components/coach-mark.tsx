"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── 类型定义 ──────────────────────────────────────────────────

export interface CoachMarkStep {
  /** 目标元素的 CSS 选择器，如 "[data-guide='fab']" */
  target: string;
  /** 引导文案（支持 \n 换行） */
  message: string;
  /** 气泡位置：spotlight 的上方或下方 */
  placement: "top" | "bottom";
}

export interface CoachMarkProps {
  steps: CoachMarkStep[];
  onComplete: () => void;
}

// ── 常量 ──────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 8;
const RETRY_DELAY = 500;
const MAX_RETRIES = 3;
const BUBBLE_MAX_WIDTH = 260;
const BUBBLE_MARGIN = 16;

// ── 组件 ──────────────────────────────────────────────────────

export function CoachMark({ steps, onComplete }: CoachMarkProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // 稳定 onComplete 引用，避免 useCallback 依赖变化导致 retry counter 重置
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 清理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // 查找目标元素并获取位置
  const findTarget = useCallback(() => {
    if (!mountedRef.current) return;
    if (currentStep >= steps.length) {
      onCompleteRef.current();
      return;
    }
    const step = steps[currentStep];
    const el = document.querySelector(step.target);
    if (el) {
      setRect(el.getBoundingClientRect());
      retryCountRef.current = 0;
    } else {
      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_RETRIES) {
        // 跳过当前步骤
        retryCountRef.current = 0;
        const nextStep = currentStep + 1;
        if (nextStep >= steps.length) {
          if (mountedRef.current) onCompleteRef.current();
        } else {
          if (mountedRef.current) setCurrentStep(nextStep);
        }
      } else {
        retryTimerRef.current = setTimeout(findTarget, RETRY_DELAY);
      }
    }
  }, [currentStep, steps]);

  // 当步骤变化时查找目标
  useEffect(() => {
    retryCountRef.current = 0;
    findTarget();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [findTarget]);

  // 监听 resize + scroll 重新计算位置
  useEffect(() => {
    const recalc = () => {
      if (currentStep >= steps.length) return;
      const step = steps[currentStep];
      const el = document.querySelector(step.target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc);
    };
  }, [currentStep, steps]);

  // 点击前进
  const handleClick = useCallback(() => {
    const nextStep = currentStep + 1;
    if (nextStep >= steps.length) {
      onCompleteRef.current();
    } else {
      setCurrentStep(nextStep);
    }
  }, [currentStep, steps.length]);

  // 没有 rect 时不渲染（等待查找）
  if (!rect || currentStep >= steps.length) return null;

  const step = steps[currentStep];

  // spotlight 位置（含 padding）
  const spotlightStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
    borderRadius: 12,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
    zIndex: 9999,
    pointerEvents: "none",
  };

  // 气泡位置（含溢出修正）
  const clampedLeft = Math.max(
    BUBBLE_MARGIN,
    Math.min(rect.left, window.innerWidth - BUBBLE_MAX_WIDTH - BUBBLE_MARGIN),
  );
  const bubbleStyle: React.CSSProperties = {
    position: "fixed",
    left: clampedLeft,
    zIndex: 10000,
    maxWidth: BUBBLE_MAX_WIDTH,
  };
  if (step.placement === "top") {
    bubbleStyle.bottom = window.innerHeight - rect.top + SPOTLIGHT_PADDING + 12;
  } else {
    bubbleStyle.top = rect.bottom + SPOTLIGHT_PADDING + 12;
  }

  return (
    <>
      {/* 全屏透明点击层 */}
      <div
        data-testid="coach-mark-overlay"
        onClick={handleClick}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          cursor: "pointer",
        }}
      />

      {/* Spotlight 镂空 */}
      <div style={spotlightStyle} />

      {/* 引导气泡 */}
      <div
        data-testid="coach-mark-message"
        style={bubbleStyle}
        className="bg-surface-lowest rounded-2xl px-4 py-3 shadow-xl"
      >
        {step.message.split("\n").map((line, i) => (
          <p key={i} className="text-sm text-on-surface leading-relaxed">
            {line}
          </p>
        ))}
        <p className="text-xs text-muted-accessible mt-2">
          {currentStep < steps.length - 1 ? "点击任意位置继续" : "点击任意位置完成"}
        </p>
      </div>
    </>
  );
}
