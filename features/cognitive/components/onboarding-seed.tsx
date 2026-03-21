"use client";

import { useState } from "react";
import { Mic, Send } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";

interface OnboardingSeedProps {
  onComplete: () => void;
  onSkip: () => void;
}

const SEED_QUESTIONS = [
  "你最近在忙什么？",
  "今年最想实现的一件事？",
  "有什么一直想做但没开始的？",
] as const;

export function OnboardingSeed({ onComplete, onSkip }: OnboardingSeedProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!inputText.trim() || selectedIdx === null) return;
    setSubmitting(true);
    try {
      await fetch("/api/v1/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${SEED_QUESTIONS[selectedIdx]}\n${inputText.trim()}`,
          type: "voice",
        }),
      });
    } catch {
      console.log("Onboarding seed record:", SEED_QUESTIONS[selectedIdx], inputText);
    }
    onComplete();
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="space-y-3 text-center flex flex-col items-center">
          <LuluLogo size={64} variant="color" />
          <h1 className="text-xl font-light text-foreground tracking-wide">
            你好，我是路路
          </h1>
          <p className="text-sm text-muted-foreground">
            在开始之前，随便聊聊：
          </p>
        </div>

        {/* Question cards */}
        <div className="space-y-3">
          {SEED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left bg-card rounded-xl p-4 transition-all ${
                selectedIdx === i
                  ? "ring-2 ring-primary shadow-sm"
                  : "hover:bg-accent/40 active:scale-[0.98]"
              }`}
            >
              <span className="text-sm text-foreground">{q}</span>
            </button>
          ))}
        </div>

        {/* Input area — appears after selecting a question */}
        {selectedIdx !== null && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <button
              className="shrink-0 w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground"
              aria-label="录音"
              type="button"
            >
              <Mic size={18} />
            </button>
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="说点什么..."
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
        )}

        {/* Skip */}
        <div className="text-center pt-2">
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            type="button"
          >
            跳过，直接开始
          </button>
        </div>
      </div>
    </div>
  );
}
