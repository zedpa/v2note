"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Mic, MicOff } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { api } from "@/shared/lib/api";
import { cn } from "@/lib/utils";

interface OnboardingSeedProps {
  onComplete: () => void;
  onSkip: () => void;
}

// ── 打字机 Hook ──────────────────────────────────────────────

function useTypewriter(speed = 40) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const cancelRef = useRef(false);

  const type = useCallback(
    (text: string): Promise<void> => {
      cancelRef.current = false;
      setIsTyping(true);
      setDisplayText("");

      return new Promise((resolve) => {
        let i = 0;
        const interval = setInterval(() => {
          if (cancelRef.current) {
            clearInterval(interval);
            setDisplayText(text);
            setIsTyping(false);
            resolve();
            return;
          }
          i++;
          setDisplayText(text.slice(0, i));
          if (i >= text.length) {
            clearInterval(interval);
            setIsTyping(false);
            resolve();
          }
        }, speed);
      });
    },
    [speed],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { displayText, isTyping, type, cancel };
}

// ── 主组件 ───────────────────────────────────────────────────

export function OnboardingSeed({ onComplete, onSkip }: OnboardingSeedProps) {
  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(1); // 1-5
  const [name, setName] = useState("");
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showTypingDot, setShowTypingDot] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [viewportH, setViewportH] = useState<number | undefined>();
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 用 visualViewport 跟踪键盘高度，避免内容被推走
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportH(vv.height);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const { displayText, isTyping, type: typeText } = useTypewriter(35);

  // 已完成的消息列表（不含正在打字的消息）
  const [messages, setMessages] = useState<Array<{ role: "ai" | "user"; text: string }>>([]);
  // 当前正在打字显示的 AI 消息索引（-1 表示无）
  const [typingMsgIdx, setTypingMsgIdx] = useState(-1);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayText]);

  // 打字完成后聚焦输入框
  useEffect(() => {
    if (!isTyping && inputEnabled) {
      inputRef.current?.focus();
    }
  }, [isTyping, inputEnabled]);

  // 初始 AI 消息
  useEffect(() => {
    if (!showWelcome) {
      const initialMsg = "你好！我是路路 🦌 怎么称呼你？";
      setMessages([{ role: "ai", text: initialMsg }]);
      setInputEnabled(true);
    }
  }, [showWelcome]);

  const handleSubmit = useCallback(async () => {
    const answer = inputText.trim();
    if (!answer || submitting || !inputEnabled) return;

    setSubmitting(true);
    setInputText("");
    setInputEnabled(false);

    // 加入用户消息
    const updatedMessages = [...messages, { role: "user" as const, text: answer }];
    setMessages(updatedMessages);

    // 记住名字
    if (step === 1) {
      setName(answer);
    }

    // 立即显示加载动画（不等 API）
    setShowTypingDot(true);

    try {
      // 调用 AI 对话 API
      const res = await api.post<{
        reply: string;
        nextStep: number;
        done: boolean;
        extracted: Record<string, any>;
      }>("/api/v1/onboarding/chat", {
        step,
        answer,
        history: updatedMessages,
      });

      const { reply, nextStep, done } = res;

      // API 返回后：关闭 typing dot → 打字机效果
      setShowTypingDot(false);
      setTypingMsgIdx(updatedMessages.length);
      await typeText(reply);
      setMessages((prev) => [...prev, { role: "ai", text: reply }]);
      setTypingMsgIdx(-1);
      setInputEnabled(true);

      if (done) {
        setTimeout(onComplete, 1500);
      } else {
        setStep(nextStep);
      }
    } catch {
      setShowTypingDot(false);
      // API 失败：用 fallback 回复
      const fallbacks: Record<number, string> = {
        1: `${answer}，你好！你平时主要在忙什么呢？`,
        2: "听起来挺充实的！最近最让你花心思的事是什么？",
        3: "理解。你会不会经常想到什么转头就忘？",
        4: "这正是路路要帮你的 😊 你一般什么时候有空？",
        5: `好的${name || answer}，我们开始吧 ✨`,
      };
      const fallback = fallbacks[step] ?? "我们继续吧";
      setTypingMsgIdx(updatedMessages.length);
      await typeText(fallback);
      setMessages((prev) => [...prev, { role: "ai", text: fallback }]);
      setTypingMsgIdx(-1);
      setInputEnabled(true);

      if (step >= 5) {
        setTimeout(onComplete, 1500);
      } else {
        setStep(step + 1);
      }
    }

    setSubmitting(false);
  }, [inputText, submitting, inputEnabled, step, name, messages, typeText, onComplete]);

  const handleSkip = useCallback(async () => {
    if (step < 3) return; // Q1 Q2 不允许跳过

    const updatedMessages = [...messages, { role: "user" as const, text: "（跳过）" }];
    setMessages(updatedMessages);
    setInputEnabled(false);
    setShowTypingDot(true);

    try {
      const res = await api.post<{
        reply: string;
        nextStep: number;
        done: boolean;
      }>("/api/v1/onboarding/chat", {
        step,
        answer: "",
        history: updatedMessages,
      });

      setShowTypingDot(false);
      setTypingMsgIdx(updatedMessages.length);
      await typeText(res.reply);
      setMessages((prev) => [...prev, { role: "ai", text: res.reply }]);
      setTypingMsgIdx(-1);
      setInputEnabled(true);

      if (res.done) {
        setTimeout(onComplete, 1500);
      } else {
        setStep(res.nextStep);
      }
    } catch {
      setShowTypingDot(false);
      setInputEnabled(true);
      if (step >= 5) {
        onComplete();
      } else {
        setStep(step + 1);
      }
    }
  }, [step, messages, typeText, onComplete]);

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
      setInputText(transcript);
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

  // ── 欢迎页 ──────────────────────────────────────────────────

  if (showWelcome) {
    return (
      <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-8">
          <div className="w-24 h-24 mx-auto">
            <LuluLogo size={96} variant="color" className="animate-none" />
          </div>
          <div className="space-y-3">
            <h1 className="font-serif text-2xl text-on-surface">你好，我是路路</h1>
            <p className="text-sm text-muted-accessible leading-relaxed">
              你的每一个想法，我都帮你记住
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            开始
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-[11px] text-muted-accessible/40 hover:text-muted-accessible/60 transition-colors"
          >
            跳过，直接开始
          </button>
        </div>
      </div>
    );
  }

  // ── 对话页 ──────────────────────────────────────────────────

  const placeholder = !inputEnabled
    ? "路路在想..."
    : step === 1
      ? "你的名字或昵称"
      : "说点什么...";

  return (
    <div
      className="bg-surface flex flex-col overflow-hidden"
      style={{ height: viewportH ? `${viewportH}px` : "100dvh" }}
    >
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col overflow-hidden px-6">
        {/* 头部 */}
        <div className="flex items-center gap-3 py-6 shrink-0">
          <LuluLogo size={40} variant="color" />
          <div>
            <h1 className="font-serif text-lg text-on-surface">路路</h1>
            <p className="text-xs text-muted-accessible font-mono">
              认识你 ({step}/5)
            </p>
          </div>
        </div>

        {/* 对话消息 */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] w-fit rounded-2xl px-4 py-2.5 text-sm animate-bubble-enter",
                  msg.role === "ai"
                    ? "bg-surface-low text-on-surface"
                    : "bg-deer/15 text-on-surface",
                )}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator ··· */}
          {showTypingDot && (
            <div className="flex justify-start">
              <div className="w-fit rounded-2xl px-4 py-2.5 text-sm bg-surface-low text-on-surface animate-bubble-enter">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-accessible/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-accessible/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-accessible/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          {/* 打字机效果的 AI 消息 */}
          {isTyping && typingMsgIdx >= 0 && (
            <div className="flex justify-start">
              <div className="max-w-[80%] w-fit rounded-2xl px-4 py-2.5 text-sm bg-surface-low text-on-surface">
                {displayText}
                <span className="inline-block w-0.5 h-4 bg-on-surface/50 ml-0.5 animate-pulse align-text-bottom" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 悬浮输入区 */}
      <div className="shrink-0 bg-surface border-t border-outline/10 px-6 pb-[env(safe-area-inset-bottom,12px)] pt-3">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex items-center gap-2">
            {hasSpeechAPI && (
              <button
                type="button"
                onClick={toggleVoice}
                className={cn(
                  "shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  listening
                    ? "bg-maple/20 text-maple"
                    : "text-muted-accessible hover:text-on-surface",
                )}
                aria-label={listening ? "停止语音" : "语音输入"}
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={placeholder}
              disabled={!inputEnabled || submitting}
              autoFocus
              className="flex-1 rounded-xl bg-surface-lowest px-4 py-2.5 text-sm text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30 disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!inputText.trim() || submitting || !inputEnabled}
              className="shrink-0 w-10 h-10 rounded-full text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              aria-label="发送"
              type="button"
            >
              <Send size={16} />
            </button>
          </div>

          {/* 跳过按钮 */}
          {step >= 3 && inputEnabled && (
            <div className="text-center pt-2 pb-1">
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
          {step <= 2 && inputEnabled && (
            <div className="text-center pt-1 pb-1">
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
    </div>
  );
}
