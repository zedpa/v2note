"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function useChat(dateRange: { start: string; end: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const streamingTextRef = useRef("");
  const unsubRef = useRef<(() => void) | null>(null);

  const connect = useCallback(async () => {
    const client = getGatewayClient();
    client.connect();

    // Listen for messages
    unsubRef.current = client.onMessage((msg: GatewayResponse) => {
      switch (msg.type) {
        case "chat.chunk": {
          streamingTextRef.current += msg.payload.text;
          // Update the latest assistant message with streaming content
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
          setStreaming(false);
          streamingTextRef.current = "";
          break;
        }

        case "error": {
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
    });

    // Wait for connection
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (client.connected) {
          clearInterval(check);
          setConnected(true);
          resolve();
        }
      }, 100);
      // Timeout after 5s
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });

    // Start chat session
    const deviceId = await getDeviceId();
    setStreaming(true);
    streamingTextRef.current = "";

    // Add placeholder assistant message
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
      payload: { deviceId, mode: "review", dateRange },
    });
  }, [dateRange]);

  const send = useCallback(async (text: string) => {
    const client = getGatewayClient();
    const deviceId = await getDeviceId();

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      },
    ]);

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

    client.send({
      type: "chat.message",
      payload: { text, deviceId },
    });
  }, []);

  const disconnect = useCallback(async () => {
    const client = getGatewayClient();
    const deviceId = await getDeviceId();
    client.send({ type: "chat.end", payload: { deviceId } });

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    client.disconnect();
    setConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
      }
    };
  }, []);

  return { messages, send, streaming, connected, connect, disconnect };
}
