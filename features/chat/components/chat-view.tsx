"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Send, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "@/features/chat/hooks/use-chat";
import { useKeyboardOffset } from "@/shared/hooks/use-keyboard-offset";
import { ChatBubble } from "./chat-bubble";
import { PlanCard } from "./plan-card";
import { SwipeBack } from "@/shared/components/swipe-back";
import { executeCommand, getCommandDefs, type CommandContext } from "@/features/commands/lib/registry";

/** 聊天中可通过 "/" 快捷激活的技能 */
const CHAT_SKILLS = [
  { name: "review-guide", label: "复盘", keyword: "复盘" },
  { name: "todo-management", label: "拆解待办", keyword: "拆解" },
  { name: "munger-review", label: "芒格视角", keyword: "芒格" },
  { name: "meta-question", label: "元问题", keyword: "元问题" },
  { name: "second-order-thinking", label: "二阶思考", keyword: "二阶" },
];

interface ChatViewProps {
  dateRange: { start: string; end: string };
  onClose: () => void;
  initialMessage?: string;
  title?: string;
  mode?: "review" | "command" | "insight";
  commandContext?: Partial<CommandContext>;
  mood?: string;
  moodText?: string;
  deerState?: string;
  /** 显式指定 skill（技能面板或 "/" 快捷键触发） */
  skill?: string;
}

export function ChatView({ dateRange, onClose, initialMessage, title, mode: modeProp, commandContext, mood, moodText, deerState, skill }: ChatViewProps) {
  const resolvedMode = modeProp ?? (initialMessage ? "command" : "review");
  const { messages, send, streaming, connected, connect, disconnect, confirmPlan } =
    useChat(dateRange, {
      mode: resolvedMode,
      initialMessage,
      skill,
    });
  const [input, setInput] = useState("");
  const [skillSuggestions, setSkillSuggestions] = useState<typeof CHAT_SKILLS>([]);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 键盘偏移 + 可视区域高度（驱动整体布局）
  const { offset: bottomOffset, viewportHeight, isKeyboardOpen } = useKeyboardOffset();

  // Detect if the command list is showing (last assistant message contains command list)
  const commandDefs = useMemo(() => getCommandDefs(), []);
  const showCommandChips = useMemo(() => {
    if (!initialMessage) return false;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.content?.includes("可用命令如下") ?? false;
  }, [messages, initialMessage]);

  const handleCommandChip = useCallback((name: string) => {
    const text = `/${name}`;
    // Try local command execution first (e.g. /todos, /search open overlays)
    if (commandContext) {
      const result = executeCommand(text, commandContext);
      if (result?.handled) return;
    }
    // Not a local command — send to gateway
    send(text);
  }, [send, commandContext]);

  // "/" in chat input → show skill suggestions
  useEffect(() => {
    if (input === "/") {
      setSkillSuggestions(CHAT_SKILLS);
    } else if (input.startsWith("/") && input.length > 1) {
      const partial = input.slice(1).toLowerCase();
      setSkillSuggestions(
        CHAT_SKILLS.filter(s =>
          s.label.toLowerCase().includes(partial) ||
          s.keyword.toLowerCase().includes(partial) ||
          s.name.toLowerCase().includes(partial),
        ),
      );
    } else {
      setSkillSuggestions([]);
    }
  }, [input]);

  const handleSkillChip = useCallback((skillName: string, label: string) => {
    // 将 skill 激活指令作为消息发送给 AI
    setInput("");
    setSkillSuggestions([]);
    send(`/skill:${skillName}`);
  }, [send]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Auto-scroll to bottom on new messages or keyboard open
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isKeyboardOpen]);

  // Detect slash commands in AI responses and execute them
  const prevStreamingRef = useRef(streaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streaming;

    // Only trigger when streaming just finished
    if (wasStreaming && !streaming && commandContext) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content) {
        const trimmed = lastMsg.content.trim();
        // Check if the entire response is a slash command (e.g. "/settings")
        if (trimmed.startsWith("/") && trimmed.length < 50) {
          const result = executeCommand(trimmed, commandContext);
          if (result?.handled) return;
        }
      }
    }
  }, [streaming, messages, commandContext]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    // In command mode, try to execute local commands first
    if (initialMessage && commandContext && trimmed.startsWith("/")) {
      const result = executeCommand(trimmed, commandContext);
      if (result?.handled) {
        setInput("");
        // Don't call onClose — openOverlay already switches activeOverlay,
        // which unmounts ChatView. Calling onClose would reset it to null.
        return;
      }
    }

    send(trimmed);
    setInput("");
    inputRef.current?.focus();
  }, [input, streaming, initialMessage, commandContext, send]);

  const hasSpeechAPI =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  return (
    <SwipeBack onClose={onClose}>
      {/* Header — 独立 fixed 层，不受键盘影响 */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-[44px] bg-surface/80 backdrop-blur-[12px] border-b border-brand-border/40 pt-safe"
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface active:bg-surface/60 transition-colors select-none"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 select-none">
          <p className="text-sm font-medium text-on-surface">
            {title ?? (resolvedMode === "insight" ? "洞察分析" : (resolvedMode === "command" || initialMessage) ? "和路路聊聊" : "复盘")}
          </p>
          <div className="flex items-center gap-1">
            {resolvedMode === "insight" ? (
              <p className="text-[10px] text-muted-accessible">
                {dateRange.start} — {dateRange.end}
              </p>
            ) : (resolvedMode !== "command" && !initialMessage) ? (
              <p className="text-[10px] text-muted-accessible">
                {dateRange.start} - {dateRange.end}
              </p>
            ) : (
              <p className="text-[10px] text-muted-accessible">
                和路路对话
              </p>
            )}
            {moodText && (
              <p className="text-[10px] text-muted-accessible">
                · 心情: {moodText}{deerState ? ` · ${deerState}` : ""}
              </p>
            )}
          </div>
        </div>
        {!connected && (
          <span className="text-[10px] text-dawn">连接中...</span>
        )}
      </header>

      {/* 主容器 — 高度跟随 visualViewport，键盘弹出时自动缩小 */}
      <div
        className="fixed inset-x-0 top-0 flex flex-col bg-surface"
        style={{ height: viewportHeight }}
      >
        {/* Messages — pt 避让 header + safe-area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ paddingTop: "calc(44px + env(safe-area-inset-top, 24px))" }}
        >
          {messages.map((msg, i) =>
            msg.role === "plan" && msg.plan ? (
              <PlanCard
                key={msg.id}
                planId={msg.plan.planId}
                intent={msg.plan.intent}
                steps={msg.plan.steps}
                onConfirm={(action, mods) => confirmPlan(msg.plan!.planId, action, mods)}
              />
            ) : (
              <ChatBubble
                key={msg.id}
                message={msg}
                streaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
              />
            ),
          )}

          {/* Clickable command chips */}
          {showCommandChips && !streaming && (
            <div className="flex flex-wrap gap-2 mt-2 mb-3">
              {commandDefs.map((cmd) => (
                <button
                  key={cmd.name}
                  type="button"
                  onClick={() => handleCommandChip(cmd.name)}
                  className="px-3 py-1.5 rounded-full bg-deer/10 text-deer text-xs font-medium hover:bg-deer/20 active:bg-deer/30 transition-colors select-none"
                >
                  /{cmd.name}
                </button>
              ))}
            </div>
          )}

          {/* Spacer so messages don't hide behind input bar */}
          <div className="shrink-0 h-[72px]" />
        </div>
      </div>

      {/* Input bar — fixed 在底部，跟随键盘 */}
      <div
        className="fixed left-0 right-0 z-50 px-4 py-3 pb-safe bg-surface/90 backdrop-blur-xl border-t border-brand-border/40 shadow-[0_-4px_20px_var(--shadow-ambient)]"
        style={{ bottom: `${bottomOffset}px` }}
      >
        {/* Skill suggestions — "/" 快捷键触发 */}
        {skillSuggestions.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {skillSuggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => handleSkillChip(s.name, s.label)}
                className="px-3 py-1.5 rounded-full bg-deer/10 text-deer text-xs font-medium hover:bg-deer/20 active:bg-deer/30 transition-colors select-none"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入你的想法..."
            rows={1}
            enterKeyHint="send"
            className="flex-1 bg-surface-lowest rounded-xl px-4 py-2.5 text-sm text-on-surface outline-none resize-none placeholder:text-muted-accessible/50 max-h-24"
            style={{ minHeight: "40px" }}
            disabled={streaming}
          />
          {/* 语音输入 */}
          {hasSpeechAPI && !input.trim() && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={streaming}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0",
                listening
                  ? "bg-maple/20 text-maple"
                  : "text-muted-accessible hover:text-on-surface",
              )}
              aria-label={listening ? "停止语音" : "语音输入"}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          {/* 发送按钮 — 有文字时显示 */}
          {(input.trim() || !hasSpeechAPI) && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0",
                input.trim() && !streaming
                  ? "text-white"
                  : "bg-surface-high text-muted-accessible",
              )}
              style={
                input.trim() && !streaming
                  ? { background: "linear-gradient(135deg, #89502C, #C8845C)" }
                  : undefined
              }
              aria-label="发送"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </SwipeBack>
  );
}
