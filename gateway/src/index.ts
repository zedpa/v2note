import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "dotenv";
import { processEntry, refineTodoCommands, type ProcessPayload, type ProcessResult } from "./handlers/process.js";
import { todoRepo } from "./db/repositories/index.js";
import { initChat, sendChatMessage, endChat, type ChatStartPayload } from "./handlers/chat.js";
import { chatMessageRepo } from "./db/repositories/index.js";
import { maybeCompress } from "./handlers/chat-compression.js";
import { shouldTriggerMemory } from "./handlers/chat-memory-trigger.js";
import { aggregateTodos } from "./handlers/todo.js";
import { startASR, sendAudioChunk, stopASR, cancelASR, type ASRMode } from "./handlers/asr.js";
import { getSession } from "./session/manager.js";
import { today as tzToday, now as tzNow } from "./lib/tz.js";
import { Router } from "./router.js";
import { sendJson, sendError } from "./lib/http-helpers.js";
import { iterateStreamWithTimeout, StreamTimeoutError } from "./lib/stream-utils.js";
import { handleCors } from "./middleware/cors.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerRecordRoutes } from "./routes/records.js";
import { registerTranscriptRoutes } from "./routes/transcripts.js";
import { registerTagRoutes } from "./routes/tags.js";
import { registerTodoRoutes } from "./routes/todos.js";
import { registerIdeaRoutes } from "./routes/ideas.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerSoulRoutes } from "./routes/soul.js";
import { registerDailyLoopRoutes } from "./routes/daily-loop.js";
import { registerGoalRoutes } from "./routes/goals.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerMCPServerRoutes } from "./mcp/server.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerReleaseRoutes } from "./routes/releases.js";
import { registerStrikeRoutes } from "./routes/strikes.js";
import { registerCognitiveStatsRoutes } from "./routes/cognitive-stats.js";
import { registerActionPanelRoutes } from "./routes/action-panel.js";
import { registerCognitiveClusterRoutes } from "./routes/cognitive-clusters.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerCognitiveRelationRoutes } from "./routes/cognitive-relations.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { registerTopicRoutes } from "./routes/topics.js";
import { registerVocabularyRoutes } from "./routes/vocabulary.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerWikiRoutes } from "./routes/wiki.js";
import { getProactiveEngine } from "./proactive/engine.js";
import { verifyAccessToken } from "./auth/jwt.js";
import { generateAiStatus } from "./handlers/reflect.js";
import { eventBus, type TodoCreatedEvent } from "./lib/event-bus.js";
import { checkRateLimit, checkWsRateLimit } from "./middleware/rate-limit.js";

// Load environment
config({ path: "../.env.local" });
config({ path: ".env" });

const PORT = parseInt(process.env.GATEWAY_PORT ?? "3001", 10);
const NUM_WORKERS = Math.min(
  parseInt(process.env.CLUSTER_WORKERS ?? "0", 10) || availableParallelism(),
  4, // 最多 4 worker
);

// ── Cluster mode ──
// 设置 NO_CLUSTER=1 禁用 cluster（开发模式）
if (cluster.isPrimary && process.env.NO_CLUSTER !== "1") {
  console.log(`[gateway] Primary ${process.pid}: forking ${NUM_WORKERS} workers`);
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code) => {
    console.error(`[gateway] Worker ${worker.process.pid} died (code=${code}), restarting`);
    cluster.fork();
  });
} else {
  // Worker process or single-process mode
  startWorker();
}

function startWorker() {

// ── Message types ──

type GatewayMessage =
  | { type: "auth"; payload: { token: string; deviceId: string } }
  | { type: "process"; payload: ProcessPayload }
  | { type: "chat.start"; payload: ChatStartPayload }
  | { type: "chat.message"; payload: { text: string; deviceId: string } }
  | { type: "chat.end"; payload: { deviceId: string } }
  | { type: "todo.aggregate"; payload: { deviceId: string } }
  | { type: "asr.start"; payload: { deviceId: string; locationText?: string; mode?: ASRMode; notebook?: string; sourceContext?: "todo" | "timeline" | "chat" | "review"; saveAudio?: boolean } }
  | { type: "asr.stop"; payload: { deviceId: string; saveAudio?: boolean; forceCommand?: boolean } }
  | { type: "asr.cancel"; payload: { deviceId: string } }
  | { type: "action.confirm_reply"; payload: { deviceId: string; confirm_id: string; confirmed: boolean } }
  | { type: "todo.refine"; payload: { deviceId: string; commands: any[]; modificationText: string } };

type GatewayResponse =
  | { type: "process.result"; payload: ProcessResult }
  | { type: "chat.chunk"; payload: { text: string } }
  | { type: "chat.ready"; payload: Record<string, never> }
  | { type: "chat.done"; payload: { full_text: string } }
  | { type: "todo.result"; payload: { diary_entry: string } }
  | { type: "asr.partial"; payload: { text: string; sentenceId: number } }
  | { type: "asr.sentence"; payload: { text: string; sentenceId: number; begin_time: number; end_time: number } }
  | { type: "asr.done"; payload: { transcript: string; recordId: string; duration: number } }
  | { type: "asr.error"; payload: { message: string } }
  | { type: "command.detected"; payload: { command: string; args: string[] } }
  | { type: "proactive.message"; payload: { text: string; action?: string } }
  | { type: "proactive.todo_nudge"; payload: { todoId: string; text: string; suggestion: string } }
  | { type: "proactive.morning_briefing"; payload: { text: string } }
  | { type: "proactive.relay_reminder"; payload: { text: string; count: number } }
  | { type: "proactive.evening_summary"; payload: { text: string } }
  | { type: "reflect.question"; payload: { question: string } }
  | { type: "ai.status"; payload: { text: string } }
  | { type: "tool.status"; payload: { toolName: string; label: string; callId: string } }
  | { type: "tool.done"; payload: { toolName: string; callId: string; success: boolean; message: string; durationMs: number } }
  | { type: "auth.ok"; payload: { userId: string } }
  | { type: "action.result"; payload: { action: string; success: boolean; summary: string; todo_id?: string } }
  | { type: "todo.created"; payload: { todoId: string; text: string } }
  | { type: "error"; payload: { message: string } };

// ── HTTP Router ──

const router = new Router();

// Register all REST routes
registerDeviceRoutes(router);
registerRecordRoutes(router);
registerTranscriptRoutes(router);
registerTagRoutes(router);
registerTodoRoutes(router);
registerIdeaRoutes(router);
registerReviewRoutes(router);
registerStatsRoutes(router);
registerSkillRoutes(router);
registerExportRoutes(router);
registerSyncRoutes(router);
registerMemoryRoutes(router);
registerSoulRoutes(router);
registerDailyLoopRoutes(router);
registerGoalRoutes(router);
registerProfileRoutes(router);
registerNotebookRoutes(router);
registerMCPServerRoutes(router);
registerAuthRoutes(router);
registerReleaseRoutes(router);
registerStrikeRoutes(router);
registerCognitiveStatsRoutes(router);
registerActionPanelRoutes(router);
registerCognitiveClusterRoutes(router);
registerIngestRoutes(router);
registerCognitiveRelationRoutes(router);
registerOnboardingRoutes(router);
registerTopicRoutes(router);
registerVocabularyRoutes(router);
registerNotificationRoutes(router);
registerChatRoutes(router);
registerWikiRoutes(router);

// ── HTTP Server ──

const server = createServer(async (req, res) => {
  // CORS for all requests (including /health and non-router paths)
  if (handleCors(req, res)) return;

  // Rate limit (by IP or auth header)
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "unknown";
  const rateResult = checkRateLimit(clientIp);
  if (!rateResult.allowed) {
    const retryAfter = rateResult.retryAfter ?? 1;
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    });
    res.end(JSON.stringify({ error: "rate_limited", retryAfter }));
    return;
  }

  // Health check (before router for speed)
  if (req.url === "/health") {
    sendJson(res, { status: "ok", timestamp: tzNow().toISOString() });
    return;
  }

  // Try router (CORS already handled above)
  const handled = await router.handle(req, res);
  if (handled) return;

  // Legacy REST endpoint for process
  if (req.url === "/api/process" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload: ProcessPayload = JSON.parse(body);
        const result = await processEntry(payload);
        sendJson(res, result);
      } catch (err: any) {
        sendError(res, err.message, 500);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ── WebSocket Server ──

// wiki compile 等长时间任务需要更长超时
server.requestTimeout = 10 * 60 * 1000; // 10 min
server.headersTimeout = 10 * 60 * 1000 + 1000;
server.keepAliveTimeout = 10 * 60 * 1000;

const wss = new WebSocketServer({ server });

// Map WebSocket connections to device IDs and user IDs
const connectionDeviceMap = new Map<WebSocket, string>();
const connectionUserMap = new Map<WebSocket, string>();
// 反向映射：deviceId → 当前活跃 ws（断连重连后自动更新）
const deviceToWsMap = new Map<string, WebSocket>();

function send(ws: WebSocket, msg: GatewayResponse) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** 向设备当前活跃的 WebSocket 发送消息（断连重连后自动切换到新连接） */
function sendToDevice(deviceId: string, msg: GatewayResponse) {
  const ws = deviceToWsMap.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const proactiveEngine = getProactiveEngine();
proactiveEngine.start().catch((err) => {
  console.error("[gateway] Proactive engine start failed:", err.message);
});

// 监听 todo.created 事件，通过 WS 通知对应客户端
eventBus.on("todo.created", (evt: TodoCreatedEvent) => {
  for (const [ws, uid] of connectionUserMap.entries()) {
    if (uid === evt.deviceId || uid === evt.userId) {
      send(ws, {
        type: "todo.created",
        payload: { todoId: evt.todoId, text: evt.todoText },
      });
    }
  }
  // 也检查 deviceMap（未登录用户）
  for (const [ws, did] of connectionDeviceMap.entries()) {
    if (did === evt.deviceId && !connectionUserMap.has(ws)) {
      send(ws, {
        type: "todo.created",
        payload: { todoId: evt.todoId, text: evt.todoText },
      });
    }
  }
});

wss.on("connection", (ws) => {
  console.log("[gateway] Client connected");

  ws.on("message", async (raw, isBinary) => {
    // Binary frame: PCM audio data for ASR
    if (isBinary) {
      const deviceId = connectionDeviceMap.get(ws);
      if (deviceId) {
        sendAudioChunk(deviceId, Buffer.from(raw as Buffer), ws);
      }
      return;
    }

    let msg: GatewayMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", payload: { message: "Invalid JSON" } });
      return;
    }

    try {
      // ── auth 消息单独处理 ──
      if (msg.type === "auth") {
        try {
          const payload = verifyAccessToken(msg.payload.token);
          connectionUserMap.set(ws, payload.userId);
          connectionDeviceMap.set(ws, payload.deviceId);
          deviceToWsMap.set(payload.deviceId, ws);
          console.log(`[gateway] WebSocket authenticated: user=${payload.userId}, device=${payload.deviceId}`);
          send(ws, { type: "auth.ok", payload: { userId: payload.userId } });

          proactiveEngine.registerDevice(payload.deviceId, ws, payload.userId);

          generateAiStatus(payload.deviceId, payload.userId)
            .then((text) => {
              send(ws, { type: "ai.status", payload: { text } });
            })
            .catch((err) => {
              console.warn("[gateway] AI status generation failed:", err.message);
            });
        } catch {
          send(ws, { type: "error", payload: { message: "Authentication failed" } });
        }
        return;
      }

      // ── WebSocket 速率限制 ──
      const wsDeviceId = connectionDeviceMap.get(ws);
      if (wsDeviceId) {
        const wsRateResult = checkWsRateLimit(wsDeviceId);
        if (!wsRateResult.allowed) {
          send(ws, { type: "error", payload: { message: "rate_limited", code: "rate_limited", retryAfter: wsRateResult.retryAfter ?? 1 } as any });
          return;
        }
      }

      // ── 认证门控：非 auth 消息必须已认证，禁止游客操作 ──
      if (!connectionUserMap.has(ws)) {
        send(ws, { type: "error", payload: { message: "Not authenticated" } });
        return;
      }

      const authedUserId = connectionUserMap.get(ws)!;

      switch (msg.type) {
        case "process": {
          (msg.payload as any).userId = authedUserId;
          const result = await processEntry(msg.payload);
          send(ws, { type: "process.result", payload: result });
          break;
        }

        case "chat.start": {
          (msg.payload as any).userId = authedUserId;
          try {
            await initChat(msg.payload);
            send(ws, { type: "chat.ready", payload: {} });
          } catch (err: any) {
            console.error(`[gateway] chat.start init error:`, err.message);
            send(ws, { type: "error", payload: { message: "会话初始化失败" } });
          }
          break;
        }

        case "chat.message": {
          // 自动恢复：如果 session 不在 chat mode（断连重连后未 chat.start），自动初始化
          {
            const session = getSession(msg.payload.deviceId);
            if (session.mode !== "chat") {
              console.log(`[chat] Auto-recovering chat session for device ${msg.payload.deviceId}`);
              try {
                const todayStr = tzToday();
                await initChat({
                  deviceId: msg.payload.deviceId,
                  userId: authedUserId,
                  mode: "command",
                  dateRange: { start: todayStr, end: todayStr },
                });
              } catch (err: any) {
                console.error(`[gateway] chat auto-recovery failed:`, err.message);
                send(ws, { type: "error", payload: { message: "会话恢复失败，请重新打开对话" } });
                break;
              }
            }
          }
          // 持久化用户消息（先于 AI 处理）
          if (authedUserId && msg.payload.text) {
            chatMessageRepo.saveMessage(authedUserId, "user", msg.payload.text).catch(e =>
              console.warn(`[chat] Failed to persist user msg: ${e.message}`),
            );
            // 即时记忆触发：关键词快筛 + 异步 maybeCreateMemory
            if (shouldTriggerMemory(msg.payload.text)) {
              const session = getSession(msg.payload.deviceId);
              const todayStr = tzToday();
              session.memoryManager.maybeCreateMemory(
                msg.payload.deviceId, msg.payload.text, todayStr, authedUserId,
              ).catch(e => console.warn(`[chat] Memory trigger failed: ${e.message}`));
            }
          }
          const chatDeviceId = msg.payload.deviceId;
          let fullText = "";
          try {
            const stream = await sendChatMessage(
              chatDeviceId,
              msg.payload.text,
            );
            // 使用 sendToDevice 替代 send(ws)：断连重连后自动切换到新连接
            await iterateStreamWithTimeout(stream, (chunk) => {
              if (chunk.startsWith("\x00TOOL_STATUS:")) {
                const parts = chunk.slice(13).split(":", 3);
                sendToDevice(chatDeviceId, { type: "tool.status", payload: { toolName: parts[0], label: parts[1], callId: parts[2] ?? "" } });
                return;
              }
              if (chunk.startsWith("\x00TOOL_DONE:")) {
                const parts = chunk.slice(11).split(":", 5);
                sendToDevice(chatDeviceId, { type: "tool.done", payload: {
                  toolName: parts[0], callId: parts[1] ?? "",
                  success: parts[2] === "true", message: parts[3] ?? "",
                  durationMs: parseInt(parts[4] ?? "0", 10),
                } });
                return;
              }
              fullText += chunk;
              sendToDevice(chatDeviceId, { type: "chat.chunk", payload: { text: chunk } });
            });
          } catch (streamErr: any) {
            console.error(`[gateway] chat.message stream error:`, streamErr.message);
            if (!fullText) fullText = "抱歉，出了点问题，请稍后再试。";
          }
          const session = getSession(chatDeviceId);
          session.context.addMessage({ role: "assistant", content: fullText });
          sendToDevice(chatDeviceId, { type: "chat.done", payload: { full_text: fullText } });
          // 持久化 AI 回复（异步）
          if (fullText && authedUserId) {
            chatMessageRepo.saveMessage(authedUserId, "assistant", fullText).catch(e =>
              console.warn(`[chat] Failed to persist assistant msg: ${e.message}`),
            );
            // 异步检查并执行压缩（不阻塞响应）
            maybeCompress(authedUserId).catch(() => {});
          }
          break;
        }

        case "chat.end": {
          await endChat(msg.payload.deviceId);
          send(ws, { type: "chat.done", payload: { full_text: "" } });
          break;
        }

        case "todo.aggregate": {
          const result = await aggregateTodos(msg.payload.deviceId, authedUserId);
          send(ws, { type: "todo.result", payload: result });
          break;
        }

        case "asr.start": {
          console.log(`[asr.start] notebook=${msg.payload.notebook}, mode=${msg.payload.mode}, sourceContext=${msg.payload.sourceContext}`);
          connectionDeviceMap.set(ws, msg.payload.deviceId);
          proactiveEngine.registerDevice(msg.payload.deviceId, ws, authedUserId);
          await startASR(ws, msg.payload.deviceId, msg.payload.locationText, msg.payload.mode, msg.payload.notebook, authedUserId, msg.payload.sourceContext, msg.payload.saveAudio);
          break;
        }

        case "asr.stop": {
          const deviceId = connectionDeviceMap.get(ws);
          if (deviceId) {
            await stopASR(ws, deviceId, msg.payload.saveAudio, msg.payload.forceCommand);
            connectionDeviceMap.delete(ws);
          }
          break;
        }

        case "asr.cancel": {
          const deviceId = connectionDeviceMap.get(ws);
          if (deviceId) {
            cancelASR(deviceId, ws);
            connectionDeviceMap.delete(ws);
          }
          break;
        }

        case "todo.refine": {
          try {
            const refined = await refineTodoCommands(msg.payload.commands, msg.payload.modificationText);
            send(ws, { type: "process.result", payload: { todo_commands: refined, voice_intent_type: "action" } });
          } catch (err: any) {
            console.error(`[gateway] todo.refine error:`, err.message);
            send(ws, { type: "error", payload: { message: `修改失败: ${err.message}` } });
          }
          break;
        }

        case "action.confirm_reply": {
          const { deviceId, confirm_id, confirmed } = msg.payload;
          const session = getSession(deviceId);
          const pending = session.pendingConfirms.get(confirm_id);

          if (!pending) {
            send(ws, { type: "action.result", payload: { action: "unknown", success: false, summary: "确认已过期或不存在" } });
            break;
          }

          if (Date.now() > pending.expiresAt) {
            session.pendingConfirms.delete(confirm_id);
            send(ws, { type: "action.result", payload: { action: pending.action, success: false, summary: "确认已超时，操作未执行" } });
            break;
          }

          session.pendingConfirms.delete(confirm_id);

          if (!confirmed) {
            send(ws, { type: "action.result", payload: { action: pending.action, success: false, summary: "已取消" } });
            break;
          }

          if (pending.action === "delete_todo" && pending.todoId) {
            try {
              const todo = await todoRepo.findById(pending.todoId);
              await todoRepo.update(pending.todoId, { done: true });
              const text = todo?.text?.slice(0, 30) ?? pending.todoId;
              send(ws, { type: "action.result", payload: { action: "delete_todo", success: true, summary: `已取消「${text}」`, todo_id: pending.todoId } });
            } catch (err: any) {
              send(ws, { type: "action.result", payload: { action: "delete_todo", success: false, summary: `删除失败: ${err.message}` } });
            }
          } else {
            send(ws, { type: "action.result", payload: { action: pending.action, success: false, summary: `暂不支持 ${pending.action} 的确认操作` } });
          }
          break;
        }

        default:
          send(ws, {
            type: "error",
            payload: { message: `Unknown message type: ${(msg as any).type}` },
          });
      }
    } catch (err: any) {
      console.error(`[gateway] Error handling ${msg.type}:`, err);
      send(ws, { type: "error", payload: { message: err.message } });
    }
  });

  ws.on("close", () => {
    // Cleanup ASR session on disconnect
    const deviceId = connectionDeviceMap.get(ws);
    if (deviceId) {
      cancelASR(deviceId, ws);
      connectionDeviceMap.delete(ws);
      // 仅当 deviceToWsMap 指向本连接时才清除（新连接可能已覆盖）
      if (deviceToWsMap.get(deviceId) === ws) {
        deviceToWsMap.delete(deviceId);
      }
    }
    connectionUserMap.delete(ws);
    proactiveEngine.unregisterByWs(ws);
    console.log("[gateway] Client disconnected");
  });
});

// ── Start ──

server.listen(PORT, "0.0.0.0", () => {
  const pid = process.pid;
  const mode = cluster.isWorker ? `Worker ${pid}` : `Single ${pid}`;
  console.log(`[gateway] ${mode}: v2note Dialog Gateway on port ${PORT}`);
  console.log(`[gateway] WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`[gateway] REST API: http://0.0.0.0:${PORT}/api/v1/`);
  console.log(`[gateway] Health: http://0.0.0.0:${PORT}/health`);
});

} // end startWorker
