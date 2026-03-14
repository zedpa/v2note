"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";
import { loadLocalConfig } from "@/shared/lib/local-config";
import { getCommandDefs } from "@/features/commands/lib/registry";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface UseChatOptions {
  mode?: "review" | "command" | "insight";
  initialMessage?: string;
}

function buildCommandListMessage(): string {
  const commands = getCommandDefs();
  const lines = commands.map((c) => `/${c.name} - ${c.description}`);
  return `可用命令如下：\n${lines.join("\n")}\n\n你可以直接输入命令继续操作。`;
}

export function useChat(
  dateRange: { start: string; end: string },
  options?: UseChatOptions,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const streamingTextRef = useRef("");
  const unsubRef = useRef<(() => void) | null>(null);
  const responseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track whether chat.start has been sent to the gateway
  const sessionStartedRef = useRef(false);
  // Store AI preamble (e.g. AiWindow message shown as assistant before user input)
  const aiPreambleRef = useRef<string | null>(null);
  // Store dateRange in a ref so send() can access it without being in deps
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;
  // Generation counter to prevent stale async disconnect from overriding new connect
  const connectGenRef = useRef(0);

  const clearResponseTimeout = useCallback(() => {
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
  }, []);

  const armResponseTimeout = useCallback((fallbackText: string) => {
    clearResponseTimeout();
    responseTimeoutRef.current = setTimeout(() => {
      setStreaming(false);
      streamingTextRef.current = "";
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: fallbackText },
          ];
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fallbackText,
            timestamp: new Date(),
          },
        ];
      });
    }, 25000);
  }, [clearResponseTimeout]);

  const handleGatewayMessage = useCallback((msg: GatewayResponse) => {
    switch (msg.type) {
      case "chat.chunk": {
        clearResponseTimeout();
        streamingTextRef.current += msg.payload.text;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...last, content: streamingTextRef.current },
            ];
          }
          return prev;
        });
        break;
      }
      case "chat.done": {
        clearResponseTimeout();
        setStreaming(false);
        streamingTextRef.current = "";
        break;
      }
      case "error": {
        clearResponseTimeout();
        setStreaming(false);
        streamingTextRef.current = "";
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `错误: ${msg.payload.message}`,
            timestamp: new Date(),
          },
        ]);
        break;
      }
    }
  }, [clearResponseTimeout]);

  const connect = useCallback(async () => {
    const gen = ++connectGenRef.current;
    const mode = options?.mode ?? "review";

    // For "/" command bootstrap: return command list immediately (no AI call, no gateway needed)
    if (mode === "command" && /^\/\s*$/.test(options?.initialMessage ?? "")) {
      sessionStartedRef.current = false;
      setStreaming(false);
      streamingTextRef.current = "";
      setConnected(true);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "/",
          timestamp: new Date(),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: buildCommandListMessage(),
          timestamp: new Date(),
        },
      ]);
      // Connect in background for follow-up messages
      const client = getGatewayClient();
      client.connect();
      unsubRef.current = client.onMessage(handleGatewayMessage);
      return;
    }

    const client = getGatewayClient();
    client.connect();

    // Listen for messages
    unsubRef.current = client.onMessage(handleGatewayMessage);

    const ready = await client.waitForReady(8000);
    // Check generation: if a newer connect started, bail out
    if (gen !== connectGenRef.current) return;

    if (!ready) {
      setConnected(false);
      setStreaming(false);
      streamingTextRef.current = "";
      clearResponseTimeout();
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "连接服务器超时，请检查网络后重试。",
          timestamp: new Date(),
        },
      ]);
      return;
    }
    setConnected(true);

    // Start chat session
    const deviceId = await getDeviceId();
    if (gen !== connectGenRef.current) return;
    const localConfig = await loadLocalConfig();
    if (gen !== connectGenRef.current) return;

    sessionStartedRef.current = true;
    setStreaming(true);
    streamingTextRef.current = "";

    // For command mode with initialMessage: show as AI greeting, wait for user input
    if (mode === "command" && options?.initialMessage) {
      aiPreambleRef.current = options.initialMessage;
      sessionStartedRef.current = false;
      setStreaming(false);
      streamingTextRef.current = "";
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: options.initialMessage,
          timestamp: new Date(),
        },
      ]);
      // Don't send chat.start yet — wait for user's first message
      return;
    }

    // Review mode or command without initialMessage: start streaming immediately
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      },
    ]);

    client.send({
      type: "chat.start",
      payload: {
        deviceId,
        mode,
        dateRange,
        initialMessage: options?.initialMessage,
        localConfig,
      },
    });
    armResponseTimeout("请求超时，AI暂未返回。请重试或检查网关状态。");
  }, [
    dateRange,
    options?.mode,
    options?.initialMessage,
    armResponseTimeout,
    clearResponseTimeout,
    handleGatewayMessage,
  ]);

  const send = useCallback(async (text: string) => {
    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      },
    ]);

    let deviceId: string;
    try {
      deviceId = await getDeviceId();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "无法连接服务器，请检查网络或在设置中配置正确的服务器地址。",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    const client = getGatewayClient();
    const ready = await client.waitForReady(5000);

    if (!ready) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "当前未连接到服务器，请稍后重试。",
          timestamp: new Date(),
        },
      ]);
      setStreaming(false);
      streamingTextRef.current = "";
      clearResponseTimeout();
      return;
    }

    // Add placeholder for assistant response
    setStreaming(true);
    streamingTextRef.current = "";
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      },
    ]);

    // If gateway session not started yet (e.g. "/" bootstrap or AI preamble), send chat.start instead of chat.message
    if (!sessionStartedRef.current) {
      const localConfig = await loadLocalConfig();
      const preamble = aiPreambleRef.current;
      aiPreambleRef.current = null;
      client.send({
        type: "chat.start",
        payload: {
          deviceId,
          mode: "command",
          dateRange: dateRangeRef.current,
          initialMessage: text,
          assistantPreamble: preamble ?? undefined,
          localConfig,
        },
      });
      sessionStartedRef.current = true;
    } else {
      client.send({
        type: "chat.message",
        payload: { text, deviceId },
      });
    }
    armResponseTimeout("请求超时，AI暂未返回。请稍后重试。");
  }, [armResponseTimeout, clearResponseTimeout]);

  // disconnect is synchronous to avoid race with connect()
  // The chat.end message is fire-and-forget
  const disconnect = useCallback(() => {
    const client = getGatewayClient();

    // Fire-and-forget chat.end (needs async deviceId)
    void getDeviceId().then((deviceId) => {
      client.send({ type: "chat.end", payload: { deviceId } });
    }).catch(() => {});

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    clearResponseTimeout();
    client.disconnect();
    setConnected(false);
    sessionStartedRef.current = false;
  }, [clearResponseTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearResponseTimeout();
      if (unsubRef.current) {
        unsubRef.current();
      }
    };
  }, [clearResponseTimeout]);

  return { messages, send, streaming, connected, connect, disconnect };
}
