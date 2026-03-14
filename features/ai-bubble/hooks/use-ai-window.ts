"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getGatewayClient,
  type GatewayResponse,
} from "@/features/chat/lib/gateway-client";

export interface AiMessage {
  id: string;
  type: "reflect" | "nudge" | "briefing" | "summary" | "relay" | "status";
  text: string;
  chatAction?: {
    command?: string;
    initialMessage?: string;
    overlay?: string;
  };
  priority: number;
  expiresAt?: number;
}

export interface UseAiWindowReturn {
  currentMessage: AiMessage | null;
  handleTap: () => void;
  onChatReturn: () => void;
  show: (msg: AiMessage) => void;
}

let _idCounter = 0;
function nextId() {
  return `ai-msg-${++_idCounter}-${Date.now()}`;
}

export function useAiWindow(opts?: {
  onOpenChat?: (initial?: string) => void;
  onOpenOverlay?: (name: string) => void;
}): UseAiWindowReturn {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Current message = highest priority (lowest number)
  const currentMessage =
    messages.length > 0
      ? messages.reduce((a, b) => (a.priority <= b.priority ? a : b))
      : null;

  const show = useCallback((msg: AiMessage) => {
    setMessages((prev) => {
      // Replace same-type message instead of stacking
      const filtered = prev.filter((m) => m.type !== msg.type);
      return [...filtered, { ...msg, id: msg.id || nextId() }];
    });
  }, []);

  const handleTap = useCallback(() => {
    if (!currentMessage) return;

    const action = currentMessage.chatAction;
    if (action?.overlay) {
      optsRef.current?.onOpenOverlay?.(action.overlay);
    } else if (action?.command) {
      optsRef.current?.onOpenChat?.(action.command);
    } else if (action?.initialMessage) {
      optsRef.current?.onOpenChat?.(action.initialMessage);
    } else {
      optsRef.current?.onOpenChat?.();
    }
  }, [currentMessage]);

  const onChatReturn = useCallback(() => {
    // Clear reflect messages after user enters chat
    setMessages((prev) => prev.filter((m) => m.type !== "reflect"));
  }, []);

  // Listen for chat close event (fired from page.tsx closeOverlay)
  useEffect(() => {
    const handler = () => onChatReturn();
    window.addEventListener("ai-window:chat-return", handler);
    return () => window.removeEventListener("ai-window:chat-return", handler);
  }, [onChatReturn]);

  // Show default greeting on mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const greetings = [
      "嗨，今天有什么想聊的吗？",
      "在这里陪着你，随时可以说话",
      "有什么新想法吗？说给我听听",
      "准备好记录今天的灵感了吗？",
    ];
    const hour = new Date().getHours();
    let greeting: string;
    if (hour >= 5 && hour < 11) {
      greeting = "早上好！新的一天，有什么计划吗？";
    } else if (hour >= 11 && hour < 14) {
      greeting = "中午好！休息一下，聊聊天？";
    } else if (hour >= 14 && hour < 18) {
      greeting = "下午好！今天进展怎么样？";
    } else if (hour >= 18 && hour < 22) {
      greeting = "晚上好！今天过得怎么样？";
    } else {
      greeting = "夜深了，有什么心事想说说吗？";
    }

    show({
      id: nextId(),
      type: "status",
      text: greeting,
      priority: 10,
    });
  }, [show]);

  // Listen to gateway messages
  useEffect(() => {
    const client = getGatewayClient();

    const unsub = client.onMessage((msg: GatewayResponse) => {
      switch (msg.type) {
        case "reflect.question":
          show({
            id: nextId(),
            type: "reflect",
            text: (msg as any).payload.question,
            priority: 1,
            chatAction: {
              initialMessage: (msg as any).payload.question,
            },
          });
          break;

        case "proactive.todo_nudge":
          show({
            id: nextId(),
            type: "nudge",
            text: msg.payload.suggestion,
            priority: 2,
            chatAction: { command: "/todos" },
          });
          break;

        case "proactive.morning_briefing":
          show({
            id: nextId(),
            type: "briefing",
            text: msg.payload.text,
            priority: 3,
            chatAction: { overlay: "morning-briefing" },
          });
          break;

        case "proactive.evening_summary":
          show({
            id: nextId(),
            type: "summary",
            text: msg.payload.text,
            priority: 4,
            chatAction: { overlay: "evening-summary" },
          });
          break;

        case "ai.status":
          show({
            id: nextId(),
            type: "status",
            text: (msg as any).payload.text,
            priority: 10,
          });
          break;
      }
    });

    return unsub;
  }, [show]);

  // Auto-demote nudge/briefing messages after 8 seconds
  useEffect(() => {
    if (!currentMessage) return;
    if (
      currentMessage.type === "nudge" ||
      currentMessage.type === "briefing" ||
      currentMessage.type === "summary"
    ) {
      const timer = setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentMessage.id ? { ...m, priority: 9 } : m,
          ),
        );
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [currentMessage?.id, currentMessage?.type]);

  return { currentMessage, handleTap, onChatReturn, show };
}
