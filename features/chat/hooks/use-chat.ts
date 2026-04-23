"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { loadLocalConfig } from "@/shared/lib/local-config";
import { getCommandDefs } from "@/features/commands/lib/registry";
import { fetchChatHistory, clearChatHistory, type ChatHistoryMessage } from "@/shared/lib/api/chat";
import * as chatCache from "@/features/chat/lib/chat-cache";
import type { ChatCacheMessage } from "@/features/chat/lib/chat-cache";
import { emit } from "@/features/recording/lib/events";
import { captureStore } from "@/shared/lib/capture-store";
import { triggerSync } from "@/shared/lib/sync-orchestrator";
import { getOrCreateGuestBatchId, peekGuestBatchId } from "@/shared/lib/guest-session";
// §7.4: 账号视图隔离
import { filterCapturesByAccountView } from "@/shared/lib/account-view-filter";
import { fabNotify } from "@/shared/lib/fab-notify";
import {
  mergeChatHistory,
  type ServerChatMessage,
} from "@/shared/lib/chat-history-merge";

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

/**
 * 同步状态（仅 user role 消息使用）。
 * regression: fix-cold-resume-silent-loss (Phase 5)
 */
export type ChatSyncStatus = "captured" | "syncing" | "synced" | "failed";

export interface ChatMessage {
  id: string;
  /**
   * Phase 5：captureStore 中对应的 localId（仅 user role 消息）。
   * 同时作为发往 gateway 的 client_id，gateway 在 chat.done 中回显。
   */
  localId?: string;
  /** Phase 5：= localId，便于接收端直接按 client_id 匹配 */
  client_id?: string;
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
  /**
   * Phase 5：同步状态（仅 user role）。
   * assistant / plan 消息不使用此字段。
   */
  syncStatus?: ChatSyncStatus;
  /** Phase 7：同步失败次数（仅 user role，用于判断是否 >= 5 → ⚠ 面板） */
  retryCount?: number;
  /** Phase 7：最近一次失败原因（面板展开时展示给用户） */
  lastError?: string | null;
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
  // M7：retrySync 快速双击节流——记录正在重试推送中的 localId，避免重复唤醒
  const retryInFlightRef = useRef<Set<string>>(new Set());

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

  // §7.4: auth 身份变化（login/logout）时实时刷新 userIdRef，避免用过期身份过滤/缓存
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ kind: string; userId: string | null }>;
      userIdRef.current = ce.detail?.userId ?? null;
    };
    window.addEventListener("auth:user-changed", handler as EventListener);
    return () =>
      window.removeEventListener("auth:user-changed", handler as EventListener);
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
          "manage_wiki_page", "create_record", "update_record",
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
        // Phase 5：回显 client_id → 把对应 user 消息标为 synced
        const ackClientId = (msg.payload as any)?.client_id as string | undefined;
        setMessages((prev) => {
          // 将所有 running 的 tool-call parts 切换为 done
          let updated = prev.map((m): ChatMessage => {
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
          // Phase 5：按 client_id 回写 syncStatus="synced"
          if (ackClientId) {
            updated = updated.map((m): ChatMessage =>
              m.role === "user" && m.client_id === ackClientId
                ? { ...m, syncStatus: "synced" }
                : m,
            );
          }
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
        // Phase 5：捕获侧 store 同步（让 sync-orchestrator 视角也收敛）
        // C1/C2：清理 syncingAt 租约，避免 worker 下一轮仍把它当作"悬挂"
        if (ackClientId) {
          captureStore
            .update(ackClientId, {
              syncStatus: "synced",
              serverId: ackClientId,
              syncingAt: null,
            })
            .catch(() => {
              // 条目可能从未入 captureStore（历史 send 路径）或已被删除 → 忽略
            });
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
      // Phase 7 §5.3：不再在捕获路径插入阻塞错误气泡。
      // 离线 / ws 暂不可用由 SyncStatusBanner 统一提示；用户捕获仍可落地。
      setConnected(false);
      setStreaming(false);
      streamingTextRef.current = "";
      clearResponseTimeout();
      return;
    }
    setConnected(true);

    // Start chat session
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

      // 2. 后台从服务端同步（补齐新消息）+ 合并本地 captureStore 未同步 chat_user_msg
      //    regression: fix-cold-resume-silent-loss (Phase 6, spec §3.3)
      //    刷新页面后，即使服务端失败也要渲染本地未同步消息；三角桥去重。
      let serverRaw: ChatHistoryMessage[] = [];
      let serverHasMore = false;
      let serverFetchOk = false;
      try {
        const res = await fetchChatHistory({ limit: 30 });
        if (gen !== connectGenRef.current) return;
        serverRaw = res.messages;
        serverHasMore = res.has_more;
        serverFetchOk = true;
      } catch {
        // 网络失败 → 保持 serverRaw 为空，继续走合并（本地条目会被渲染）
      }

      // 拉本地 chat_user_msg
      let localChatCaps: Awaited<ReturnType<typeof captureStore.listByKind>> = [];
      try {
        localChatCaps = await captureStore.listByKind("chat_user_msg", 100);
        // §7.4: 严格按账号视图过滤，防止切账号后看到上一个账号的本地消息
        localChatCaps = filterCapturesByAccountView(localChatCaps, {
          currentUserId: userIdRef.current,
          currentSessionBatchId: peekGuestBatchId(),
        });
      } catch {
        // IndexedDB 不可用 → 空集合，不阻断
      }

      if (gen !== connectGenRef.current) return;

      if (serverRaw.length > 0 || localChatCaps.length > 0) {
        const serverForMerge: ServerChatMessage[] = serverRaw.map((m) => ({
          id: m.id,
          // 后端若回显 client_id 则用于去重
          client_id: (m as { client_id?: string | null }).client_id ?? null,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          parts: m.parts,
        }));

        const merged = mergeChatHistory(localChatCaps, serverForMerge, {
          // M1：防 strict-mode 双触发 + worker 竞争覆盖：只在 fresh.syncStatus !== 'synced' 时 update。
          // 不是完整的 race 解决（见 defer M9），但挡住常见的双触发场景。
          onAckRecovered: async (localId, serverId) => {
            try {
              const fresh = await captureStore.get(localId);
              if (!fresh || fresh.syncStatus === "synced") return;
              await captureStore.update(localId, {
                syncStatus: "synced",
                serverId,
                syncingAt: null,
              });
            } catch {
              // 吞掉异常（update 失败不影响本轮渲染）
            }
          },
        });

        const mergedChatMessages: ChatMessage[] = merged.map((r) => ({
          id: r.id,
          localId: r.localId,
          client_id: r.client_id,
          role: r.role,
          content: r.content,
          timestamp: new Date(r.created_at),
          parts: r.parts as MessagePart[] | undefined,
          syncStatus: r.role === "user" ? r.syncStatus : undefined,
          // Phase 7：透传 retryCount / lastError 供 ⚠ 面板使用
          retryCount: r.role === "user" ? r.retryCount : undefined,
          lastError: r.role === "user" ? r.lastError ?? null : undefined,
        }));
        setMessages(mergedChatMessages);
        setHasMore(serverFetchOk ? serverHasMore : false);

        // 仅服务端消息写缓存（本地未同步条目由 captureStore 管理，不重复进 chat-cache）
        if (userId && serverRaw.length > 0) {
          chatCache
            .putBatch(
              serverRaw.map((m) => ({
                id: m.id,
                userId,
                role: m.role,
                content: m.content,
                parts: m.parts,
                created_at: m.created_at,
              })),
            )
            .catch(() => {});
        }
      } else {
        setHasMore(false);
      }
    }

    // 发 chat.start 仅做 session 初始化（不流式），等用户发消息走 chat.message
    sessionStartedRef.current = false;
    setStreaming(false);
    client.send({
      type: "chat.start",
      payload: {
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
    // ── M3: 斜杠命令不入 captureStore ──
    // /compact、/skill:xxx 等后端命令的文本只在当前会话上下文有意义，
    // 若入同步队列离线后被当普通 chat.message 推送 → gateway 会按普通
    // 消息跑 LLM，产生上下文错乱。命令路径保留"在线才发送、发送即丢弃"语义。
    const trimmed = text.trim();
    const isSlashCommand =
      trimmed.startsWith("/") && /^\/[a-zA-Z][\w:-]*(\s|$)/.test(trimmed);

    if (isSlashCommand) {
      // 仍然乐观渲染用户消息 + 占位 AI 回复，但不入 captureStore / triggerSync
      const uiId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: uiId,
          role: "user",
          content: text,
          timestamp: new Date(),
        },
      ]);
      cacheMsg("user", text, uiId);

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

      const client = getGatewayClient();
      if (client.connected) {
        client.send({ type: "chat.message", payload: { text } });
        // P0.3（M4）：见 spec §5.3，文案由占位"正在同步中…"取代。
        armResponseTimeout("正在同步中…");
      }
      // 离线时命令直接丢弃（见 spec §3.5）。不 triggerSync。
      return;
    }

    // ── Phase 5: 本地先落地 ─────────────────────────
    // 规则（spec §3.1 / §3.2）：
    // 1. captureStore.create 瞬时落地（localId 即 client_id）
    // 2. 乐观消息立即入消息列表（syncStatus="captured"）
    // 3. **不**等 waitForReady；未连接也不插入阻塞错误气泡
    // 4. WS 已 OPEN → 立即 send chat.message（带 client_id）
    //    WS 未连 → 由 sync-orchestrator 后台推送
    let localId: string;
    let capturedToStore = false;
    // Phase 8（spec §4.3）：未登录时写 guestBatchId，登录后由 guest-claim 归属回填
    const currentUserId = userIdRef.current;
    const guestBatchId = currentUserId === null ? getOrCreateGuestBatchId() : null;
    try {
      const captured = await captureStore.create({
        kind: "chat_user_msg",
        text,
        audioLocalId: null,
        sourceContext: "chat_view",
        forceCommand: false,
        notebook: null,
        userId: currentUserId,
        guestBatchId,
      });
      localId = captured.localId;
      capturedToStore = true;
    } catch {
      // 极端：IndexedDB 不可用 → 仍然乐观渲染，退化为内存态 localId
      // （同步队列无法接管，但不阻塞 UI；用户至少看到自己说了什么）
      localId = crypto.randomUUID();
    }

    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        localId,
        client_id: localId,
        role: "user",
        content: text,
        timestamp: new Date(),
        syncStatus: "captured",
      },
    ]);
    // 保留旧的 chat-cache 本地历史缓存（独立于 captureStore，用于返回时快速恢复 UI）
    cacheMsg("user", text, localId);

    // Add placeholder for assistant response（乐观渲染，不依赖 WS 状态）
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

    // WS 已连 → 直接发 chat.message；未连 → 触发后台同步
    const client = getGatewayClient();
    if (client.connected) {
      // C1 租约：在 client.send 之前把该条目标记为 syncing + 当前租约时间戳，
      // 使 sync-orchestrator 的 listUnsynced 在租约窗口内跳过此条，
      // 避免"直接 WS 发送 + 后台 worker"双推 → gateway 重跑 LLM。
      if (capturedToStore) {
        try {
          await captureStore.update(localId, {
            syncStatus: "syncing",
            syncingAt: new Date().toISOString(),
          });
        } catch {
          // 可能已被 GC 清理，继续发送不阻塞
        }
      }

      client.send({
        type: "chat.message",
        payload: { text, client_id: localId },
      });
      // P0.3（M4）：占位文案遵循 spec §5.3 — 不出现"超时/失败/请重试"等指责用户的字眼，
      // 全局 banner (SyncStatusBanner) 统一汇报网络/同步状态。
      armResponseTimeout("正在同步中…");

      // C1 兜底：若 WS 发送后 chat.done 始终不到达（断连、gateway 挂），
      // 40s 后触发一次后台同步，让 worker 在租约 60s 过期时回收重试。
      setTimeout(() => {
        triggerSync();
      }, 40_000);

      // M1 注意：online 分支**不再立即** triggerSync()，否则 worker 可能
      // 在 chat.done 到达前读到 syncing 条目（如果未及时 mark），导致双推。
    } else {
      // 离线：由 sync-orchestrator 推送；不插入阻塞错误气泡
      // TODO(Phase 8): 未登录态（userIdRef.current 为 null）时应禁用输入或
      // 在 syncStatus=failed 上提示"需登录后同步"；目前会被 pushCapture 的
      // subject_mismatch / 401 分支拦截，记录保留在本地不丢。
      triggerSync();
    }
  }, [armResponseTimeout, cacheMsg]);

  // disconnect is synchronous to avoid race with connect()
  // The chat.end message is fire-and-forget
  //
  // P0.1 修复（对抗审查 C1）：组件级 disconnect **不再** 调用 client.disconnect()。
  // gateway-client 是全局单例，被 FAB / sync-orchestrator / voice-to-text 共用；
  // ChatView 卸载时若关闭全局 WS，会触发 SyncStatusBanner 30s 倒计时误报"同步暂不可用"。
  // 生命周期由 SyncBootstrap / FAB / orchestrator 自行管理，组件仅清理自己的订阅。
  const disconnect = useCallback(() => {
    const client = getGatewayClient();

    // Fire-and-forget chat.end（通知 gateway 本会话结束，不影响 WS 生命周期）
    client.send({ type: "chat.end", payload: {} });

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    clearResponseTimeout();
    // ⚠️ 禁止 client.disconnect()：全局 WS 由 bootstrap 管理
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
    client.send({
      type: "plan.confirm",
      payload: { planId, action, modifications },
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

  /**
   * Phase 7 §5.1：用户点击 ⚠ 面板中的"重试"按钮。
   *   - captureStore.update(localId, { syncStatus: "captured", retryCount: 0, lastError: null })
   *   - triggerSync() 唤醒 worker 重新推送
   *   - 本地 messages state 同步把 syncStatus 切回 captured
   */
  const retrySync = useCallback(async (localId: string) => {
    // M7：快速双击节流——若该 localId 的重试正在进行中，直接 return
    if (retryInFlightRef.current.has(localId)) return;
    retryInFlightRef.current.add(localId);
    try {
      try {
        await captureStore.update(localId, {
          syncStatus: "captured",
          retryCount: 0,
          lastError: null,
        });
      } catch {
        // 记录可能已被其他 tab 删除 → 忽略，仍更新 UI
      }
      setMessages((prev) =>
        prev.map((m): ChatMessage =>
          m.localId === localId
            ? { ...m, syncStatus: "captured", retryCount: 0, lastError: null }
            : m,
        ),
      );
      triggerSync();
    } finally {
      // 200ms 节流窗：短时间内不允许再次点 retry（防抖双击）
      setTimeout(() => {
        retryInFlightRef.current.delete(localId);
      }, 200);
    }
  }, []);

  /**
   * Phase 7 §5.1：用户点击 ⚠ 面板中的"删除"按钮。
   *   - captureStore.delete(localId)
   *   - 本地 messages state 移除该条
   */
  /**
   * P0.2 修复（对抗审查 C2）：若 capture 已有 serverId（ack 丢失后服务端其实入库成功），
   * 纯本地删除后下次 fetchChatHistory 会把服务端版本拉回 → 出现"删不掉的僵尸消息"。
   *
   * 当前 gateway 并无 `DELETE /api/v1/chat/messages/:id` 按条删除接口
   * （仅 `DELETE /api/v1/chat/history` 整库清空）。
   *
   * 降级策略（本 spec §5.1 边界扩展）：
   *   - 若 cap.serverId 存在 → 仍然本地删除 + 显示警告 toast：
   *     "消息已从本设备删除，联网后将尝试清理服务端副本"
   *   - 若 cap.serverId 为 null → 纯本地删除（现行行为）
   *
   * 未来新增 DELETE 接口后，此处可改为调用服务端删除 + 失败降级。
   */
  const deleteSync = useCallback(async (localId: string) => {
    let hadServerCopy = false;
    try {
      const cap = await captureStore.get(localId);
      if (cap && cap.serverId) {
        hadServerCopy = true;
      }
    } catch {
      // IndexedDB 读失败 → 不影响删除流程
    }
    try {
      await captureStore.delete(localId);
    } catch {
      // 已不存在 → 忽略
    }
    setMessages((prev) => prev.filter((m) => m.localId !== localId));
    if (hadServerCopy) {
      fabNotify.info("消息已从本设备删除，联网后将尝试清理服务端副本");
    }
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

  return {
    messages,
    send,
    streaming,
    connected,
    connect,
    disconnect,
    confirmPlan,
    loadMore,
    loadingHistory,
    hasMore,
    clearHistory,
    /** Phase 7：同步失败条目用户重试（retry >= 5 面板） */
    retrySync,
    /** Phase 7：同步失败条目用户删除（retry >= 5 面板） */
    deleteSync,
  };
}
