"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { api } from "@/shared/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CounselorChatProps {
  context: string;
  onClose: () => void;
}

/* ── framework prefixes ── */
const FRAMEWORK_PREFIXES: Record<string, string> = {
  "/munger":
    "请以查理·芒格的多元思维模型（反转思考、能力圈、第二层思考、检查清单）来分析以下问题：\n\n",
  "/mao":
    "请以毛泽东的战略思维（矛盾论、实践论、群众路线、农村包围城市）来分析以下问题：\n\n",
};

/* ── parse [strike:xxx] into clickable links ── */
const STRIKE_RE = /\[strike:([a-f0-9]+)\]/g;

function renderContent(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  STRIKE_RE.lastIndex = 0;
  while ((match = STRIKE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const strikeId = match[1];
    parts.push(
      <a
        key={match.index}
        href={`/timeline?strike=${strikeId}`}
        className="underline underline-offset-2 text-bark/70 hover:text-bark transition-colors"
        title={`认知记录 ${strikeId}`}
      >
        [{strikeId}]
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

/* ── save conversation as diary via ingest ── */
async function saveConversationAsDiary(messages: Message[]) {
  if (messages.length === 0) return;
  const lines = messages.map(
    (m) => (m.role === "user" ? "我：" : "路路：") + m.content,
  );
  const content = `【咨询对话记录】\n${lines.join("\n")}`;
  try {
    await api.post("/api/v1/ingest", { type: "text", content });
  } catch {
    // best-effort save
  }
}

export default function CounselorChat({ context, onClose }: CounselorChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>(messages);

  // Keep ref in sync for cleanup
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save conversation on unmount (close)
  useEffect(() => {
    return () => {
      saveConversationAsDiary(messagesRef.current);
    };
  }, []);

  const handleSend = useCallback(async () => {
    const raw = input.trim();
    if (!raw || loading) return;

    // Detect framework prefix
    let question = raw;
    let frameworkPrefix = "";
    for (const [prefix, instruction] of Object.entries(FRAMEWORK_PREFIXES)) {
      if (raw.toLowerCase().startsWith(prefix)) {
        question = raw.slice(prefix.length).trim();
        frameworkPrefix = instruction;
        break;
      }
    }

    if (!question) return;

    const userMsg: Message = { role: "user", content: raw };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/chat/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: frameworkPrefix + question }),
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
  }, [input, loading]);

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
              className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-bark text-cream rounded-br-sm"
                  : "bg-sand text-bark rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
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
            placeholder="输入你的问题… (/munger 或 /mao 切换视角)"
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
