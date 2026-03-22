"use client";

import { useState, useRef, useEffect } from "react";
import { LuluLogo } from "@/components/brand/lulu-logo";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CounselorChatProps {
  context: string;
  onClose: () => void;
}

export default function CounselorChat({ context, onClose }: CounselorChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/chat/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer ?? data.message ?? "抱歉，暂时无法回答。",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "网络错误，请稍后再试。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-cream text-bark">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <LuluLogo size={28} />
          <span className="font-serif font-semibold text-sm">路路咨询师</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-bark/50 hover:text-bark hover:bg-sand transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-bark/40 text-sm text-center mt-8">
            有什么想聊的？路路在这里陪你 ✿
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <LuluLogo size={24} className="shrink-0 mt-1" />
            )}
            <div
              className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-bark text-cream rounded-br-sm"
                  : "bg-sand text-bark rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <LuluLogo size={24} className="shrink-0 mt-1" />
            <div className="bg-sand text-bark/50 rounded-xl rounded-bl-sm px-3 py-2 text-sm">
              正在思考…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-brand-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleSend()}
            placeholder="输入你的问题…"
            className="flex-1 rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-bark placeholder:text-bark/30 focus:outline-none focus:ring-1 focus:ring-bark/20"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-bark text-cream px-3 py-2 text-sm font-medium hover:bg-bark/90 disabled:opacity-40 transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
