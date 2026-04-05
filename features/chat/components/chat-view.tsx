"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Send, Mic, Square } from "lucide-react";
import { useVoiceToText } from "@/features/recording/hooks/use-voice-to-text";
import { cn } from "@/lib/utils";
import { useChat } from "@/features/chat/hooks/use-chat";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 语音转文字（gateway ASR）
  const voice = useVoiceToText({
    onTranscript: (text) => setInput((prev) => prev ? prev + text : text),
    sourceContext: "chat",
  });

  // 键盘状态（用于自动滚动触发）
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      const offset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      setIsKeyboardOpen(offset > 50);
    };
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);

  // Detect if the command list is showing (last assistant message contains command list)
  const commandDefs = useMemo(() => getCommandDefs(), []);
  const showCommandChips = useMemo(() => {
    if (!initialMessage) return false;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.content?.includes("可用命令如下") ?? false;
  }, [messages, initialMessage]);

  const handleCommandChip = useCallback((name: string) => {
    const text = `/${name}`;
    if (commandContext) {
      const result = executeCommand(text, commandContext);
      if (result?.handled) return;
    }
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

  const handleSkillChip = useCallback((skillName: string, _label: string) => {
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

    if (wasStreaming && !streaming && commandContext) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content) {
        const trimmed = lastMsg.content.trim();
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

    if (initialMessage && commandContext && trimmed.startsWith("/")) {
      const result = executeCommand(trimmed, commandContext);
      if (result?.handled) {
        setInput("");
        return;
      }
    }

    send(trimmed);
    setInput("");
    inputRef.current?.focus();
  }, [input, streaming, initialMessage, commandContext, send]);

  const toggleVoice = useCallback(() => {
    if (voice.recording) {
      voice.stop();
    } else {
      voice.start();
    }
  }, [voice]);

  // 组件卸载时自动取消录音
  useEffect(() => {
    return () => {
      voice.cancel();
    };
  }, []);

  return (
    <SwipeBack onClose={onClose}>
      {/* 主容器 — 高度跟随 visualViewport，键盘弹出时自动缩小 */}
      <div
        className="fixed inset-x-0 top-0 flex flex-col bg-surface"
        style={{ height: "var(--app-height, 100dvh)" }}
      >
        {/* ── Header: 极简 — "路路" + 呼吸状态灯 ── */}
        <header
          className="shrink-0 flex items-center gap-3 px-5 h-[56px] pt-safe"
          style={{
            background: "linear-gradient(to bottom, var(--surface) 60%, transparent)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface active:bg-surface/60 transition-colors select-none"
            aria-label="返回"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 select-none">
            <span className="text-[17px] font-semibold text-on-surface">
              {title ?? "路路"}
            </span>
            {/* AI 在线呼吸灯 */}
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                connected
                  ? "bg-[#32D74B] animate-[pulse-glow_2s_ease-in-out_infinite]"
                  : "bg-muted-accessible",
              )}
              style={connected ? {
                boxShadow: "0 0 8px #32D74B",
              } : undefined}
            />
          </div>
        </header>

        {/* ── Messages 消息区 ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-4"
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
          <div className="shrink-0 h-[80px]" />
        </div>
      </div>

      {/* ── 底部输入区: 毛玻璃控制中心 ── */}
      <div
        className="fixed left-0 right-0 z-50 px-5 py-3 pb-safe bg-surface/85 backdrop-blur-[20px]"
        style={{
          bottom: "var(--kb-offset, 0px)",
          transition: "bottom 150ms ease-out",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
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
        {/* 录音实时转写预览 */}
        {voice.recording && (voice.confirmedText || voice.partialText) && (
          <div className="px-2 pb-2 text-center">
            <span className="text-sm text-on-surface/70">{voice.confirmedText}</span>
            <span className="text-sm text-on-surface/35">{voice.partialText}</span>
          </div>
        )}
        <div className="flex items-end gap-3">
          {/* 输入框 — 胶囊形 */}
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
            className="flex-1 bg-surface-lowest rounded-full px-5 py-2.5 text-[15px] text-on-surface outline-none resize-none placeholder:text-muted-accessible/50 max-h-24"
            style={{
              minHeight: "44px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            disabled={streaming}
          />
          {/* 语音按钮 — gateway ASR，44×44px 触控区 */}
          {!input.trim() && !voice.recording && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={streaming}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-deer/15 text-deer hover:bg-deer/30 transition-colors shrink-0"
              aria-label="语音输入"
            >
              <Mic size={20} />
            </button>
          )}
          {/* 录音中 — 停止按钮 */}
          {voice.recording && (
            <button
              type="button"
              onClick={toggleVoice}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-maple/20 text-maple animate-pulse shrink-0"
              aria-label="停止录音"
            >
              <Square size={18} className="fill-current" />
            </button>
          )}
          {/* 发送按钮 — 品牌渐变，44×44px */}
          {input.trim() && !voice.recording && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className={cn(
                "flex items-center justify-center w-11 h-11 rounded-full transition-colors shrink-0",
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
              <Send size={18} />
            </button>
          )}
        </div>
      </div>
    </SwipeBack>
  );
}
