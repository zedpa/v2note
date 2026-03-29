"use client";

import { useEffect, useRef } from "react";
import { useRive, useStateMachineInput, Layout, Fit, Alignment } from "@rive-app/react-canvas";
import { cn } from "@/lib/utils";
import {
  LULU_RIV_PATH,
  LULU_STATE_MACHINE,
  LULU_ARTBOARD,
  LULU_STATE_META,
  type LuluState,
} from "../lib/lulu-states";
import { LuluLogo } from "@/components/brand/lulu-logo";

interface LuluMascotProps {
  /** 当前情绪状态 */
  state?: LuluState;
  /** 尺寸（px） */
  size?: number;
  className?: string;
  /** 点击回调 */
  onClick?: () => void;
}

/**
 * 路路小鹿 — Rive 动画吉祥物组件
 *
 * 通过 Rive State Machine 切换 10 种情绪状态
 * 当 .riv 文件不存在时自动降级为静态 SVG Logo
 */
export function LuluMascot({
  state = "idle",
  size = 48,
  className,
  onClick,
}: LuluMascotProps) {
  const prevState = useRef<LuluState>(state);
  const meta = LULU_STATE_META[state];

  const { rive, RiveComponent } = useRive({
    src: LULU_RIV_PATH,
    artboard: LULU_ARTBOARD,
    stateMachines: LULU_STATE_MACHINE,
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    onLoadError: () => {
      // .riv 文件未找到，降级到静态 Logo（由 fallback 处理）
    },
  });

  // 状态机输入：每个状态对应一个 Trigger
  const idleInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "idle");
  const notesInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "notes");
  const happyInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "happy");
  const drinkingInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "drinking");
  const spacingInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "spacing");
  const angryInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "angry");
  const caringInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "caring");
  const speakingInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "speaking");
  const thinkingInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "thinking");
  const runningInput = useStateMachineInput(rive, LULU_STATE_MACHINE, "running");

  const inputMap: Record<LuluState, typeof idleInput> = {
    idle: idleInput,
    notes: notesInput,
    happy: happyInput,
    drinking: drinkingInput,
    spacing: spacingInput,
    angry: angryInput,
    caring: caringInput,
    speaking: speakingInput,
    thinking: thinkingInput,
    running: runningInput,
  };

  // 状态变化时触发对应的 Trigger
  useEffect(() => {
    if (state === prevState.current && rive) return;
    prevState.current = state;

    const input = inputMap[state];
    if (input) {
      // 触发 Trigger 类型的输入
      input.fire();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, rive]);

  // 如果 Rive 未加载成功，降级为静态 SVG
  if (!rive) {
    return (
      <div
        onClick={onClick}
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: size, height: size }}
        role="img"
        aria-label={meta.a11y}
      >
        <LuluLogo size={size} variant="color" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center cursor-pointer",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={meta.a11y}
    >
      <RiveComponent
        style={{ width: size, height: size }}
      />
    </div>
  );
}
