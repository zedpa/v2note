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
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "ai" | "user"; text: string }>>([
    { role: "ai", text: STEPS[0].question },
  ]);

  const currentStep = STEPS[step];

  const submitAnswer = useCallback(async (answer: string) => {
    const stepNum = step + 1;
    try {
      await api.post("/api/v1/onboarding/answer", { step: stepNum, answer });
    } catch {
      // 静默失败
    }
  }, [step]);

  const handleSubmit = useCallback(async () => {
    const answer = inputText.trim();
    if (!answer) return;

    setSubmitting(true);
    setMessages((prev) => [...prev, { role: "user", text: answer }]);

    if (step === 0) setName(answer);

    await submitAnswer(answer);
    setInputText("");

    const nextStep = step + 1;
    if (nextStep >= STEPS.length) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `好的${name || answer}，我们开始吧！有什么想法随时告诉我 ✨` },
      ]);
      setTimeout(onComplete, 1500);
    } else {
      const nextQ = nextStep === 1
        ? `${answer}，你现在主要在做什么？上学、工作、创业、带娃…随便说说。`
        : STEPS[nextStep].question;
      setMessages((prev) => [...prev, { role: "ai", text: nextQ }]);
      setStep(nextStep);
    }

    setSubmitting(false);
  }, [inputText, step, name, submitAnswer, onComplete]);

  const handleSkip = useCallback(async () => {
    if (step < 2) return;
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
    <div className="min-h-dvh bg-surface flex flex-col px-6 py-12">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-8">
          <LuluLogo size={40} variant="color" />
          <div>
            <h1 className="font-serif text-lg text-on-surface">路路</h1>
            <p className="text-xs text-muted-accessible font-mono">
              路路问你 ({step + 1}/5)
            </p>
          </div>
        </div>

        {/* 对话消息 */}
        <div className="flex-1 space-y-4 overflow-y-auto mb-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm animate-bubble-enter",
                msg.role === "ai"
                  ? "bg-surface-low text-on-surface self-start"
                  : "bg-sky/15 text-on-surface self-end ml-auto",
              )}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={currentStep?.placeholder ?? "说点什么..."}
            autoFocus
            className="flex-1 rounded-xl bg-surface-lowest px-4 py-2.5 text-sm text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30"
          />
          <button
            onClick={handleSubmit}
            disabled={!inputText.trim() || submitting}
            className="shrink-0 w-10 h-10 rounded-full text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            aria-label="发送"
            type="button"
          >
            <Send size={16} />
          </button>
        </div>

        {/* 跳过按钮 */}
        {currentStep?.canSkip && (
          <div className="text-center pt-3">
            <button
              onClick={handleSkip}
              className="text-xs text-muted-accessible/60 hover:text-muted-accessible transition-colors"
              type="button"
            >
              跳过这个问题
            </button>
          </div>
        )}

        {/* 全局跳过 */}
        {step < 2 && (
          <div className="text-center pt-2">
            <button
              onClick={onSkip}
              className="text-[11px] text-muted-accessible/40 hover:text-muted-accessible/60 transition-colors"
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
