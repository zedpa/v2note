"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";
import { loadLocalConfig } from "@/shared/lib/local-config";
import { getCommandDefs } from "@/features/commands/lib/registry";
import { fetchChatHistory, clearChatHistory, type ChatHistoryMessage } from "@/shared/lib/api/chat";
import * as chatCache from "@/features/chat/lib/chat-cache";
import type { ChatCacheMessage } from "@/features/chat/lib/chat-cache";
import { emit } from "@/features/recording/lib/events";

/** 消息内嵌 part 类型 */
export type MessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      callId: string;
      toolName: string;
      label: string;
      status: "running" | "done" | "error";
      result?: string;
      durationMs?: number;
    }
  | { type: "step-start" };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "plan";
  content: string;
  timestamp: Date;
  /** 结构化内容（工具调用 + 文本交替） */
  parts?: MessagePart[];
  /** Plan 消息的结构化数据 */
  plan?: {
    planId: string;
    intent: string;
    steps: Array<{ index: number; description: string; toolName?: string; needsConfirm?: boolean; status?: string; result?: string }>;
  };
}

interface UseChatOptions {
  mode?: "review" | "command" | "insight";
  initialMessage?: string;
  /** 显式指定 skill（技能面板或 "/" 快捷键触发） */
  skill?: string;
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
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
  // 当前用户 ID（从 auth token 解析，用于缓存）
  const userIdRef = useRef<string | null>(null);
  // 是否已加载过历史（避免重复加载）
  const historyLoadedRef = useRef(false);

  // 从 localStorage auth token 解析 userId
  useEffect(() => {
    try {
      const raw = localStorage.getItem("voicenote:auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        userIdRef.current = parsed.user?.id ?? null;
      }
    } catch { /* ignore */ }
  }, []);

  // 缓存消息转 ChatMessage
  const fromCacheMsg = useCallback((m: ChatHistoryMessage | ChatCacheMessage): ChatMessage => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: new Date(m.created_at),
    parts: m.parts as MessagePart[] | undefined,
  }), []);

  // 写入缓存（静默失败）
  const cacheMsg = useCallback((role: "user" | "assistant", content: string, id?: string) => {
    const userId = userIdRef.current;
    if (!userId || !content) return;
    chatCache.put({
      id: id ?? crypto.randomUUID(),
      userId,
      role,
      content,
      created_at: new Date().toISOString(),
    }).catch(() => {});
  }, []);

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
            // 更新 parts 中最后一个 text part，或追加新 text part
            const parts = [...(last.parts ?? [])];
            const lastPart = parts[parts.length - 1];
            if (lastPart?.type === "text") {
              parts[parts.length - 1] = { type: "text", text: streamingTextRef.current };
            } else {
              parts.push({ type: "text", text: streamingTextRef.current });
            }
            return [
              ...prev.slice(0, -1),
              { ...last, content: streamingTextRef.current, parts },
            ];
          }
          return prev;
        });
        break;
      }
      case "tool.status" as string: {
        clearResponseTimeout();
        const { toolName, label, callId } = (msg as any).payload;
        // 工具开始执行：在当前 assistant 消息的 parts 中追加 tool-call part
        // 同时重置 streamingTextRef 以便后续文本作为新 text part
        streamingTextRef.current = "";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            const parts: MessagePart[] = [...(last.parts ?? [])];
            parts.push({
              type: "tool-call",
              callId: callId ?? `tc-${Date.now()}`,
              toolName,
              label,
              status: "running",
            });
            return [...prev.slice(0, -1), { ...last, parts }];
          }
          return prev;
        });
        break;
      }
      case "tool.done" as string: {
        const { toolName, callId, success, message: resultMsg, durationMs } = (msg as any).payload;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.parts) {
            const parts = last.parts.map((p): MessagePart => {
              if (p.type === "tool-call" && p.callId === callId) {
                return { ...p, status: success ? "done" : "error", result: resultMsg, durationMs };
              }
              return p;
            });
            return [...prev.slice(0, -1), { ...last, parts }];
          }
          return prev;
        });
        // 数据变更类工具执行完后，触发前端列表 + 文件夹刷新
        const dataTools = [
          "manage_folder", "move_record", "create_record", "update_record",
          "delete_record", "create_todo", "update_todo", "delete_todo",
          "create_goal", "update_goal", "update_user_info",
        ];
        if (dataTools.includes(toolName)) {
          emit("recording:processed");
        }
        break;
      }
      case "chat.done": {
        clearResponseTimeout();
        setStreaming(false);
        const finalText = streamingTextRef.current || msg.payload?.full_text || "";
        streamingTextRef.current = "";
        setMessages((prev) => {
          // 将所有 running 的 tool-call parts 切换为 done
          const updated = prev.map((m): ChatMessage => {
            if (m.role === "assistant" && m.parts) {
              const hasRunning = m.parts.some((p) => p.type === "tool-call" && p.status === "running");
              if (hasRunning) {
                return {
                  ...m,
                  parts: m.parts.map((p): MessagePart =>
                    p.type === "tool-call" && p.status === "running"
                      ? { ...p, status: "done" }
                      : p,
                  ),
                };
              }
            }
            return m;
          });
          // 空内容兜底
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            const fallback = msg.payload?.full_text || "抱歉，我没能回复你。请稍后再试。";
            return [
              ...updated.slice(0, -1),
              { ...last, content: fallback },
            ];
          }
          return updated;
        });
        // AI 回复写入本地缓存
        if (finalText) {
          cacheMsg("assistant", finalText);
        }
        break;
      }
      case "plan.proposed": {
        clearResponseTimeout();
        setStreaming(false);
        const { planId: ppId, intent: ppIntent, steps: ppSteps } = (msg as any).payload;
        setMessages((prev) => [
          ...prev,
          {
            id: `plan-${ppId}`,
            role: "plan" as const,
            content: ppIntent as string,
            timestamp: new Date(),
            plan: { planId: ppId as string, intent: ppIntent as string, steps: ppSteps },
          },
        ]);
        break;
      }
      case "plan.step_done": {
        const { planId, stepIndex, status: stepStatus, result: stepResult } = (msg as any).payload;
        setMessages((prev) =>
          prev.map((m): ChatMessage => {
            if (m.plan && m.plan.planId === planId) {
              const updatedSteps = m.plan.steps.map((s) =>
                s.index === stepIndex ? { ...s, status: stepStatus as string, result: stepResult as string } : s,
              );
              return { ...m, plan: { planId: m.plan.planId, intent: m.plan.intent, steps: updatedSteps } };
            }
            return m;
          }),
        );
        break;
      }
      case "plan.done": {
        const { planId: donePlanId } = (msg as any).payload;
        setMessages((prev) =>
          prev.map((m): ChatMessage => {
            if (m.plan && m.plan.planId === donePlanId) {
              const doneSteps = m.plan.steps.map((s) =>
                s.status === "pending" ? { ...s, status: "done" } : s,
              );
              return { ...m, plan: { planId: m.plan.planId, intent: m.plan.intent, steps: doneSteps } };
            }
            return m;
          }),
        );
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

    // ── 历史加载（command 模式） ──
    if (mode === "command" && !historyLoadedRef.current) {
      historyLoadedRef.current = true;
      const userId = userIdRef.current;

      // 1. 先从 IndexedDB 缓存加载（毫秒级）
      if (userId) {
        try {
          const cached = await chatCache.getRecent(userId, 30);
          if (cached.length > 0) {
            setMessages(cached.reverse().map(fromCacheMsg));
          }
        } catch { /* IndexedDB 不可用，降级 */ }
      }

      // 2. 后台从服务端同步（补齐新消息）
      try {
        const res = await fetchChatHistory({ limit: 30 });
        if (gen !== connectGenRef.current) return;
        if (res.messages.length > 0) {
          const serverMessages = res.messages.reverse().map(fromCacheMsg);
          setMessages(serverMessages);
          setHasMore(res.has_more);
          if (userId) {
            chatCache.putBatch(
              res.messages.map((m) => ({
                id: m.id,
                userId,
                role: m.role,
                content: m.content,
                parts: m.parts,
                created_at: m.created_at,
              })),
            ).catch(() => {});
          }
        } else {
          setHasMore(false);
        }
      } catch {
        // 网络失败，缓存数据已展示
      }
    }

    // 发 chat.start 仅做 session 初始化（不流式），等用户发消息走 chat.message
    sessionStartedRef.current = false;
    setStreaming(false);
    client.send({
      type: "chat.start",
      payload: {
        deviceId,
        mode,
        dateRange,
        skill: options?.skill,
        localConfig,
      },
    });
  }, [
    dateRange,
    options?.mode,
    options?.initialMessage,
    options?.skill,
    armResponseTimeout,
    clearResponseTimeout,
    handleGatewayMessage,
  ]);

  // 上滑加载更多历史消息
  const loadMore = useCallback(async () => {
    if (loadingHistory || !hasMore) return;
    const userId = userIdRef.current;
    if (!userId) return;

    setLoadingHistory(true);
    try {
      // 找到当前最早的消息
      const currentMessages = messages;
      const oldest = currentMessages[0];
      if (!oldest) { setLoadingHistory(false); return; }

      // 先从缓存查
      const cached = await chatCache.getBefore(userId, oldest.timestamp.toISOString(), 30);
      if (cached.length >= 30) {
        setMessages((prev) => [...cached.reverse().map(fromCacheMsg), ...prev]);
        setLoadingHistory(false);
        return;
      }

      // 缓存不足，从服务端拉取
      const res = await fetchChatHistory({ limit: 30, before: oldest.id });
      if (res.messages.length > 0) {
        const older = res.messages.reverse().map(fromCacheMsg);
        setMessages((prev) => [...older, ...prev]);
        // 写入缓存
        chatCache.putBatch(
          res.messages.map((m) => ({
            id: m.id, userId, role: m.role, content: m.content,
            parts: m.parts, created_at: m.created_at,
          })),
        ).catch(() => {});
      }
      setHasMore(res.has_more);
    } catch {
      // 网络失败静默
    } finally {
      setLoadingHistory(false);
    }
  }, [loadingHistory, hasMore, messages, fromCacheMsg]);

  const send = useCallback(async (text: string) => {
    // Add user message immediately
    const userMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: text,
        timestamp: new Date(),
      },
    ]);
    // 写入本地缓存
    cacheMsg("user", text, userMsgId);

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

    // 统一走 chat.message
    client.send({
      type: "chat.message",
      payload: { text, deviceId },
    });
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

  const confirmPlan = useCallback(async (
    planId: string,
    action: "execute_all" | "execute_modified" | "abandon",
    modifications?: Array<{ stepIndex: number; description?: string; deleted?: boolean }>,
  ) => {
    const client = getGatewayClient();
    const deviceId = await getDeviceId();
    client.send({
      type: "plan.confirm",
      payload: { deviceId, planId, action, modifications },
    });
    // 标记 plan 消息为已确认
    setMessages((prev) =>
      prev.map((m) => {
        if (m.plan?.planId === planId) {
          return { ...m, content: action === "abandon" ? "已放弃" : m.content };
        }
        return m;
      }),
    );
  }, []);

  const clearHistory = useCallback(async () => {
    setMessages([]);
    setHasMore(false);
    sessionStartedRef.current = false;
    historyLoadedRef.current = false;
    const userId = userIdRef.current;
    if (userId) {
      chatCache.clearByUser(userId).catch(() => {});
    }
    clearChatHistory().catch((e) => console.warn("[chat] Clear history API failed:", e));
  }, []);

  return { messages, send, streaming, connected, connect, disconnect, confirmPlan, loadMore, loadingHistory, hasMore, clearHistory };
}
