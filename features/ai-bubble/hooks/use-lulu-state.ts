"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { LuluState } from "../lib/lulu-states";

/**
 * 管理路路小鹿的当前情绪状态
 *
 * 状态优先级：显式设置 > 消息类型推断 > 系统事件推断 > idle
 * 带自动回退：非 idle 状态在一定时间后自动恢复为 idle
 */
export function useLuluState() {
  const [state, setState] = useState<LuluState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** 自动回退到 idle 的超时时间（毫秒） */
  const AUTO_RESET: Partial<Record<LuluState, number>> = {
    speaking: 10_000,
    thinking: 30_000,
    drinking: 15_000,
    running: 8_000,
    angry: 5_000,
    caring: 12_000,
    happy: 10_000,
    notes: 20_000,
  };

  const setLuluState = useCallback(
    (next: LuluState) => {
      // 清除上一个定时器
      if (timerRef.current) clearTimeout(timerRef.current);

      setState(next);

      // 如果有自动回退时间，设置定时器
      const resetMs = AUTO_RESET[next];
      if (resetMs) {
        timerRef.current = setTimeout(() => setState("idle"), resetMs);
      }
    },
    // AUTO_RESET 是常量，不需要放入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { luluState: state, setLuluState } as const;
}
