"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, CheckCircle2, ArrowRight } from "lucide-react";
import { api } from "@/shared/lib/api";
import { cn } from "@/lib/utils";

interface OnboardingSeedProps {
  onComplete: () => void;
  onSkip: () => void;
}

// ── 主组件 ───────────────────────────────────────────────────

export function OnboardingSeed({ onComplete, onSkip }: OnboardingSeedProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [thought, setThought] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [aiResult, setAiResult] = useState<{
    summary?: string;
    todos?: string[];
    tags?: string[];
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

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
    if (step === 1) inputRef.current?.focus();
    if (step === 2 && !aiResult) textareaRef.current?.focus();
  }, [step, aiResult]);

  // ── Step 1: 提交名字 ──
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
    setStep(2);
  }, [name, submitting]);

  // ── Step 2: 提交想法 ──
  const handleThoughtSubmit = useCallback(async () => {
    const trimmed = thought.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post<{
        step: number;
        done: boolean;
        summary?: string;
        todos?: string[];
        tags?: string[];
      }>("/api/v1/onboarding/chat", { step: 2, answer: trimmed });
      setAiResult({
        summary: res.summary,
        todos: res.todos,
        tags: res.tags,
      });
    } catch {
      // 处理失败，直接完成
      onComplete();
    }
    setSubmitting(false);
  }, [thought, submitting, onComplete]);

  // ── 语音输入 ──
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join("");
      setThought(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  const hasSpeechAPI =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // ── Step 1: 输入名字 ──────────────────────────────────────────

  if (step === 1) {
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
              onClick={onSkip}
              className="text-[11px] text-muted-accessible/40 hover:text-muted-accessible/60 transition-colors"
            >
              跳过，直接开始
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: AI 拆解结果展示 ─────────────────────────────────

  if (aiResult) {
    const hasTodos = aiResult.todos && aiResult.todos.length > 0;
    const hasTags = aiResult.tags && aiResult.tags.length > 0;

    return (
      <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          {/* 结果标题 */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-deer/10">
              <CheckCircle2 size={24} className="text-deer" />
            </div>
            <h2 className="font-serif text-xl text-on-surface">
              这就是念念有路
            </h2>
            <p className="text-sm text-muted-accessible">
              你说，AI 整理
            </p>
          </div>

          {/* 你说的 */}
          <div className="rounded-2xl bg-surface-low p-4 space-y-3">
            <p className="text-xs text-muted-accessible font-medium">你说的</p>
            <p className="text-sm text-on-surface leading-relaxed">{thought}</p>
          </div>

          {/* AI 整理 */}
          <div className="rounded-2xl bg-surface-low p-4 space-y-3">
            <p className="text-xs text-muted-accessible font-medium">AI 整理</p>
            {aiResult.summary && (
              <p className="text-sm text-on-surface leading-relaxed">
                {aiResult.summary}
              </p>
            )}
            {hasTags && (
              <div className="flex flex-wrap gap-1.5">
                {aiResult.tags!.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-deer/10 text-deer text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 提取的待办 */}
          {hasTodos && (
            <div className="rounded-2xl bg-surface-low p-4 space-y-3">
              <p className="text-xs text-muted-accessible font-medium">识别的待办</p>
              <ul className="space-y-2">
                {aiResult.todos!.map((todo, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                    <span className="w-4 h-4 rounded border border-border mt-0.5 shrink-0" />
                    <span>{todo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 开始使用 */}
          <button
            type="button"
            onClick={onComplete}
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            开始使用
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: 输入想法 ──────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* 引导 */}
        <div className="text-center space-y-3">
          <h1 className="font-serif text-2xl text-on-surface">
            {name}，试试看
          </h1>
          <p className="text-sm text-muted-accessible leading-relaxed">
            说一句你现在在想的事
          </p>
        </div>

        {/* 文字输入 */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              placeholder="比如：明天要交报告，还没开始写..."
              rows={3}
              className="w-full rounded-xl bg-surface-lowest px-4 py-3 text-base text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30 resize-none"
              autoFocus
            />
            {hasSpeechAPI && (
              <button
                type="button"
                onClick={toggleVoice}
                className={cn(
                  "absolute right-3 bottom-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  listening
                    ? "bg-maple/20 text-maple animate-pulse"
                    : "text-muted-accessible hover:text-on-surface",
                )}
                aria-label={listening ? "停止语音" : "语音输入"}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleThoughtSubmit}
            disabled={!thought.trim() || submitting}
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            {submitting ? (
              <>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                <span>AI 正在整理...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                看看 AI 怎么整理
              </>
            )}
          </button>
        </div>

        {/* 跳过 */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              // 标记完成后跳过
              api.post("/api/v1/onboarding/chat", { step: 2, answer: "" }).catch(() => {});
              onComplete();
            }}
            className="text-[11px] text-muted-accessible/40 hover:text-muted-accessible/60 transition-colors"
          >
            跳过，直接开始
          </button>
        </div>
      </div>
    </div>
  );
}
