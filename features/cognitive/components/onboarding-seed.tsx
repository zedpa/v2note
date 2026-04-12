"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/shared/lib/api";

interface OnboardingSeedProps {
  onComplete: () => void;
  onSkip: () => void;
}

// ── 主组件（仅 Step 1：输入名字）───────────────────────────────

export function OnboardingSeed({ onComplete, onSkip }: OnboardingSeedProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // visualViewport: 键盘弹出时跟随
  useEffect(() => {
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
    };
  }, []);

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── 提交名字 → 后端一次调用存名字+标记完成 → onComplete ──
  const handleNameSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/api/v1/onboarding/chat", { step: 1, answer: trimmed });
    } catch {
      // 即使失败也继续
    }
    setSubmitting(false);
    onComplete();
  }, [name, submitting, onComplete]);

  // ── 跳过 → 标记完成 → onSkip ──
  const handleSkip = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post("/api/v1/onboarding/chat", { step: 1, answer: "" });
    } catch {
      // 即使失败也继续
    }
    setSubmitting(false);
    onSkip();
  }, [onSkip, submitting]);

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* 问候 */}
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-2xl text-white"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            N
          </div>
          <h1 className="font-serif text-2xl text-on-surface">你好</h1>
          <p className="text-sm text-muted-accessible leading-relaxed">
            怎么称呼你？
          </p>
        </div>

        {/* 名字输入 */}
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            placeholder="你的名字或昵称"
            className="w-full h-12 rounded-xl bg-surface-lowest px-4 text-base text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30"
            autoFocus
          />
          <button
            type="button"
            onClick={handleNameSubmit}
            disabled={!name.trim() || submitting}
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            下一步
          </button>
        </div>

        {/* 跳过 */}
        <div className="text-center">
          <button
            type="button"
            onClick={handleSkip}
            className="text-[11px] text-muted-accessible/40 hover:text-muted-accessible/60 transition-colors"
          >
            跳过，直接开始
          </button>
        </div>
      </div>
    </div>
  );
}
