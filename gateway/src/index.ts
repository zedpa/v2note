import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "dotenv";
import { processEntry, type ProcessPayload, type ProcessResult } from "./handlers/process.js";
import { startChat, sendChatMessage, endChat, type ChatStartPayload } from "./handlers/chat.js";
import { aggregateTodos } from "./handlers/todo.js";
import { startASR, sendAudioChunk, stopASR, cancelASR, type ASRMode } from "./handlers/asr.js";
import { getSession } from "./session/manager.js";
import { Router } from "./router.js";
import { sendJson, sendError } from "./lib/http-helpers.js";
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
import { registerCompanionRoutes } from "./routes/companion.js";
import { registerVocabularyRoutes } from "./routes/vocabulary.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { getProactiveEngine } from "./proactive/engine.js";
import { verifyAccessToken } from "./auth/jwt.js";
import { generateAiStatus } from "./handlers/reflect.js";

// Load environment
config({ path: "../.env.local" });
config({ path: ".env" });

const PORT = parseInt(process.env.GATEWAY_PORT ?? "3001", 10);

// ── Message types ──

type GatewayMessage =
  | { type: "auth"; payload: { token: string; deviceId: string } }
  | { type: "process"; payload: ProcessPayload }
  | { type: "chat.start"; payload: ChatStartPayload }
  | { type: "chat.message"; payload: { text: string; deviceId: string } }
  | { type: "chat.end"; payload: { deviceId: string } }
  | { type: "todo.aggregate"; payload: { deviceId: string } }
  | { type: "asr.start"; payload: { deviceId: string; locationText?: string; mode?: ASRMode; notebook?: string } }
  | { type: "asr.stop"; payload: { deviceId: string; saveAudio?: boolean } }
  | { type: "asr.cancel"; payload: { deviceId: string } };

type GatewayResponse =
  | { type: "process.result"; payload: ProcessResult }
  | { type: "chat.chunk"; payload: { text: string } }
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
  | { type: "tool.status"; payload: { toolName: string; label: string } }
  | { type: "auth.ok"; payload: { userId: string } }
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
registerCompanionRoutes(router);
registerVocabularyRoutes(router);
registerNotificationRoutes(router);

// ── HTTP Server ──

const server = createServer(async (req, res) => {
  // CORS for all requests (including /health and non-router paths)
  if (handleCors(req, res)) return;

  // Health check (before router for speed)
  if (req.url === "/health") {
    sendJson(res, { status: "ok", timestamp: new Date().toISOString() });
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

const wss = new WebSocketServer({ server });

// Map WebSocket connections to device IDs and user IDs
const connectionDeviceMap = new Map<WebSocket, string>();
const connectionUserMap = new Map<WebSocket, string>();

function send(ws: WebSocket, msg: GatewayResponse) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const proactiveEngine = getProactiveEngine();
proactiveEngine.start().catch((err) => {
  console.error("[gateway] Proactive engine start failed:", err.message);
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
      switch (msg.type) {
        case "auth": {
          // WebSocket authentication
          try {
            const payload = verifyAccessToken(msg.payload.token);
            connectionUserMap.set(ws, payload.userId);
            connectionDeviceMap.set(ws, payload.deviceId);
            console.log(`[gateway] WebSocket authenticated: user=${payload.userId}, device=${payload.deviceId}`);
            send(ws, { type: "auth.ok", payload: { userId: payload.userId } });

            // Register device with userId for proactive engine
            proactiveEngine.registerDevice(payload.deviceId, ws, payload.userId);

            // Send personalized AI status in background
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
          break;
        }

        case "process": {
          // Inject userId from WebSocket auth
          const userId = connectionUserMap.get(ws);
          if (userId) (msg.payload as any).userId = userId;
          const result = await processEntry(msg.payload);
          send(ws, { type: "process.result", payload: result });
          break;
        }

        case "chat.start": {
          // Inject userId from WebSocket auth
          const userId = connectionUserMap.get(ws);
          if (userId) (msg.payload as any).userId = userId;
          const stream = await startChat(msg.payload);
          let fullText = "";
          for await (const chunk of stream) {
            // 工具状态标记：转为独立消息类型，不混入聊天内容
            if (chunk.startsWith("\x00TOOL_STATUS:")) {
              const parts = chunk.slice(13).split(":", 2);
              send(ws, { type: "tool.status", payload: { toolName: parts[0], label: parts[1] } });
              continue;
            }
            fullText += chunk;
            send(ws, { type: "chat.chunk", payload: { text: chunk } });
          }
          // Save assistant response to session
          const session = getSession(msg.payload.deviceId);
          session.context.addMessage({ role: "assistant", content: fullText });
          send(ws, { type: "chat.done", payload: { full_text: fullText } });
          break;
        }

        case "chat.message": {
          const stream = await sendChatMessage(
            msg.payload.deviceId,
            msg.payload.text,
          );
          let fullText = "";
          for await (const chunk of stream) {
            if (chunk.startsWith("\x00TOOL_STATUS:")) {
              const parts = chunk.slice(13).split(":", 2);
              send(ws, { type: "tool.status", payload: { toolName: parts[0], label: parts[1] } });
              continue;
            }
            fullText += chunk;
            send(ws, { type: "chat.chunk", payload: { text: chunk } });
          }
          // Save assistant response to session
          const session = getSession(msg.payload.deviceId);
          session.context.addMessage({ role: "assistant", content: fullText });
          send(ws, { type: "chat.done", payload: { full_text: fullText } });
          break;
        }

        case "chat.end": {
          await endChat(msg.payload.deviceId);
          send(ws, { type: "chat.done", payload: { full_text: "" } });
          break;
        }

        case "todo.aggregate": {
          const userId = connectionUserMap.get(ws);
          const result = await aggregateTodos(msg.payload.deviceId, userId);
          send(ws, { type: "todo.result", payload: result });
          break;
        }

        case "asr.start": {
          console.log(`[asr.start] notebook=${msg.payload.notebook}, mode=${msg.payload.mode}`);
          connectionDeviceMap.set(ws, msg.payload.deviceId);
          const userId = connectionUserMap.get(ws);
          proactiveEngine.registerDevice(msg.payload.deviceId, ws, userId);
          await startASR(ws, msg.payload.deviceId, msg.payload.locationText, msg.payload.mode, msg.payload.notebook, userId);
          break;
        }

        case "asr.stop": {
          const deviceId = connectionDeviceMap.get(ws);
          if (deviceId) {
            await stopASR(ws, deviceId, msg.payload.saveAudio);
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
    }
    connectionUserMap.delete(ws);
    proactiveEngine.unregisterByWs(ws);
    console.log("[gateway] Client disconnected");
  });
});

// ── Start ──

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway] v2note Dialog Gateway running on port ${PORT}`);
  console.log(`[gateway] WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`[gateway] REST API: http://0.0.0.0:${PORT}/api/v1/`);
  console.log(`[gateway] Health: http://0.0.0.0:${PORT}/health`);
  console.log(`[gateway] LAN: http://172.28.251.48:${PORT}`);
});
