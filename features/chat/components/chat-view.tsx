"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Send, Mic, Square, X } from "lucide-react";
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
  const { messages, send, streaming, connected, connect, disconnect, confirmPlan, loadMore, loadingHistory, hasMore, clearHistory, retrySync, deleteSync } =
    useChat(dateRange, {
      mode: resolvedMode,
      initialMessage,
      skill,
    });
  const [input, setInput] = useState("");
  /** 已选中的 skill，等用户发消息时附带 */
  const [activeSkill, setActiveSkill] = useState<{ name: string; label: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 语音转文字（gateway ASR）
  const voice = useVoiceToText({
    onTranscript: (text) => setInput((prev) => prev ? prev + text : text),
    sourceContext: "chat",
  });

  // 键盘弹出时自动滚动到底部
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // 键盘弹出/收起时滚动到底部
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
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

  // "/" → 显示命令菜单（第一级），点 skills 后切到技能列表（第二级）
  type SlashMenu = "commands" | "skills" | null;
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(null);

  useEffect(() => {
    if (input === "/") {
      setSlashMenu("commands");
    } else if (!input.startsWith("/")) {
      setSlashMenu(null);
    }
  }, [input]);

  const handleSkillChip = useCallback((skillName: string, label: string) => {
    setInput("");
    setSlashMenu(null);
    setActiveSkill({ name: skillName, label });
    inputRef.current?.focus();
  }, []);

  // Connect on mount only (不依赖 connect/disconnect 避免重复连接)
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  connectRef.current = connect;
  disconnectRef.current = disconnect;
  useEffect(() => {
    connectRef.current();
    return () => {
      disconnectRef.current();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  // 合并 commandContext + 聊天内部命令（如 /clear）
  const mergedCommandContext = useMemo(() => ({
    ...commandContext,
    clearChat: clearHistory,
  }), [commandContext, clearHistory]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    if (trimmed.startsWith("/")) {
      // /compact 直接发到后端处理，不在前端拦截
      if (trimmed === "/compact") {
        send("/compact");
        setInput("");
        return;
      }
      const result = executeCommand(trimmed, mergedCommandContext);
      if (result?.handled) {
        setInput("");
        return;
      }
    }

    // 有激活的 skill → 附带 skill 前缀
    if (activeSkill) {
      send(`/skill:${activeSkill.name} ${trimmed}`);
      setActiveSkill(null);
    } else {
      send(trimmed);
    }
    setInput("");
    inputRef.current?.focus();
  }, [input, streaming, mergedCommandContext, send, activeSkill]);

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
      {/* 主容器 — 始终全屏高度，键盘通过输入区 padding 挤压消息区 */}
      <div
        className="fixed inset-x-0 top-0 flex flex-col bg-surface"
        style={{ height: "100dvh" }}
      >
        {/* ── Header: 极简 — "路路" + 呼吸状态灯，始终固定顶部 ── */}
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
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop < 80 && hasMore && !loadingHistory) {
              loadMore();
            }
          }}
        >
          {/* 上滑加载指示器 */}
          {loadingHistory && (
            <div className="text-center text-xs text-muted-foreground py-2">加载更多...</div>
          )}
          {!hasMore && messages.length > 0 && (
            <div className="text-center text-xs text-muted-foreground py-2">已是最早的消息</div>
          )}
          {messages.map((msg, i) => {
            // 日期分隔线
            let dateSeparator: React.ReactNode = null;
            if (i === 0 || (i > 0 && getDateLabel(msg.timestamp) !== getDateLabel(messages[i - 1].timestamp))) {
              dateSeparator = (
                <div className="text-center text-xs text-muted-foreground py-3 select-none">
                  {getDateLabel(msg.timestamp)}
                </div>
              );
            }
            return msg.role === "plan" && msg.plan ? (
              <div key={msg.id}>
                {dateSeparator}
                <PlanCard
                  planId={msg.plan.planId}
                  intent={msg.plan.intent}
                  steps={msg.plan.steps}
                  onConfirm={(action, mods) => confirmPlan(msg.plan!.planId, action, mods)}
                />
              </div>
            ) : (
              <div key={msg.id}>
                {dateSeparator}
                <ChatBubble
                  message={msg}
                  streaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
                  onRetrySync={retrySync}
                  onDeleteSync={deleteSync}
                />
              </div>
            );
          })}

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
        </div>

        {/* ── 底部输入区: flex 内部元素，键盘弹出时通过 padding 推高 ── */}
        <div
          className="shrink-0 px-5 py-3 bg-surface/85 backdrop-blur-[20px]"
          style={{
            paddingBottom: "calc(var(--kb-offset, 0px) + env(safe-area-inset-bottom, 0px) + 12px)",
            transition: "padding-bottom 150ms ease-out",
            WebkitBackdropFilter: "blur(20px)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {/* "/" 命令菜单 — 第一级 */}
          {slashMenu === "commands" && (
            <div className="flex gap-2 flex-wrap mb-2">
              <button
                type="button"
                onClick={() => { setInput(""); setSlashMenu("skills"); }}
                className="px-3 py-1.5 rounded-full bg-deer/10 text-deer text-xs font-medium hover:bg-deer/20 active:bg-deer/30 transition-colors select-none"
              >
                /skills
              </button>
              <button
                type="button"
                onClick={() => { setInput(""); setSlashMenu(null); clearHistory(); }}
                className="px-3 py-1.5 rounded-full bg-deer/10 text-deer text-xs font-medium hover:bg-deer/20 active:bg-deer/30 transition-colors select-none"
              >
                /clear
              </button>
              <button
                type="button"
                onClick={() => { setInput(""); setSlashMenu(null); send("/compact"); }}
                className="px-3 py-1.5 rounded-full bg-deer/10 text-deer text-xs font-medium hover:bg-deer/20 active:bg-deer/30 transition-colors select-none"
              >
                /compact
              </button>
            </div>
          )}
          {/* "/" 命令菜单 — 第二级：技能选择 */}
          {slashMenu === "skills" && (
            <div className="flex gap-2 flex-wrap mb-2">
              <button
                type="button"
                onClick={() => setSlashMenu("commands")}
                className="px-2 py-1.5 rounded-full text-muted-accessible text-xs hover:bg-surface-high transition-colors select-none"
                aria-label="返回"
              >
                <ArrowLeft size={14} />
              </button>
              {CHAT_SKILLS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => handleSkillChip(s.name, s.label)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors select-none",
                    activeSkill?.name === s.name
                      ? "bg-deer text-white"
                      : "bg-deer/10 text-deer hover:bg-deer/20 active:bg-deer/30",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {/* 已选 skill 标记 */}
          {activeSkill && !slashMenu && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-deer/15 text-deer text-xs font-medium">
                {activeSkill.label}
                <button
                  type="button"
                  onClick={() => setActiveSkill(null)}
                  className="ml-0.5 hover:text-deer/60"
                  aria-label="取消技能"
                >
                  <X size={12} />
                </button>
              </span>
              <span className="text-[11px] text-muted-accessible">发送消息时将使用此技能</span>
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
      </div>
    </SwipeBack>
  );
}

/** 格式化日期分隔线标签 */
function getDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return "今天";
  if (days === 1) return "昨天";

  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}
