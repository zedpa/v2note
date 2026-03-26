"use client";

import { useState, useCallback } from "react";
import { Send } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { api } from "@/shared/lib/api";
import { cn } from "@/lib/utils";

interface OnboardingSeedProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface StepConfig {
  question: string;
  placeholder: string;
  canSkip: boolean;
}

const STEPS: StepConfig[] = [
  {
    question: "你好！我是路路 🦌 怎么称呼你？",
    placeholder: "你的名字或昵称",
    canSkip: false,
  },
  {
    question: "", // 动态：使用用户名字
    placeholder: "随便说说就好...",
    canSkip: false,
  },
  {
    question: "最近最让你花心思的一件事是什么？",
    placeholder: "工作、生活、学习、任何事...",
    canSkip: true,
  },
  {
    question: "你有没有觉得很多想法想过就忘了，或者决定了的事总是拖着没做？",
    placeholder: "说说你的感受...",
    canSkip: true,
  },
  {
    question: "你一般什么时候有空整理想法？早上？睡前？",
    placeholder: "比如：晚上9点左右",
    canSkip: true,
  },
];

export function OnboardingSeed({ onComplete, onSkip }: OnboardingSeedProps) {
  const [step, setStep] = useState(0); // 0-indexed
  const [name, setName] = useState("");
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "ai" | "user"; text: string }>>([
    { role: "ai", text: STEPS[0].question },
  ]);

  const currentStep = STEPS[step];

  const submitAnswer = useCallback(async (answer: string) => {
    const stepNum = step + 1; // 1-indexed for API
    try {
      await api.post("/api/v1/onboarding/answer", { step: stepNum, answer });
    } catch {
      // 静默失败，不阻断 onboarding
    }
  }, [step]);

  const handleSubmit = useCallback(async () => {
    const answer = inputText.trim();
    if (!answer) return;

    setSubmitting(true);

    // 添加用户消息
    setMessages((prev) => [...prev, { role: "user", text: answer }]);

    // 第一步存名字
    if (step === 0) {
      setName(answer);
    }

    await submitAnswer(answer);
    setInputText("");

    const nextStep = step + 1;
    if (nextStep >= STEPS.length) {
      // 完成
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `好的${name || answer}，我们开始吧！有什么想法随时告诉我 ✨` },
      ]);
      setTimeout(onComplete, 1500);
    } else {
      // 下一步
      const nextQ = nextStep === 1
        ? `${answer}，你现在主要在做什么？上学、工作、创业、带娃…随便说说。`
        : STEPS[nextStep].question;
      setMessages((prev) => [...prev, { role: "ai", text: nextQ }]);
      setStep(nextStep);
    }

    setSubmitting(false);
  }, [inputText, step, name, submitAnswer, onComplete]);

  const handleSkip = useCallback(async () => {
    if (step < 2) {
      // Q1 和 Q2 不能跳过
      return;
    }
    await submitAnswer("");
    const nextStep = step + 1;
    if (nextStep >= STEPS.length) {
      onComplete();
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: STEPS[nextStep].question },
      ]);
      setStep(nextStep);
    }
  }, [step, submitAnswer, onComplete]);

  return (
    <div className="min-h-dvh bg-background flex flex-col px-6 py-12">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <LuluLogo size={40} variant="color" />
          <div>
            <h1 className="text-lg font-medium text-foreground">路路</h1>
            <p className="text-xs text-muted-foreground">
              第 {step + 1}/5 步
            </p>
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 space-y-4 overflow-y-auto mb-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300",
                msg.role === "ai"
                  ? "bg-accent/10 text-foreground self-start"
                  : "bg-primary text-primary-foreground self-end ml-auto",
              )}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={currentStep?.placeholder ?? "说点什么..."}
              autoFocus
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!inputText.trim() || submitting}
            className="shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
            aria-label="发送"
            type="button"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Skip button */}
        {currentStep?.canSkip && (
          <div className="text-center pt-3">
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              type="button"
            >
              跳过这个问题
            </button>
          </div>
        )}

        {/* Global skip — only before Q2 is answered */}
        {step < 2 && (
          <div className="text-center pt-2">
            <button
              onClick={onSkip}
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
              type="button"
            >
              跳过，直接开始
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
