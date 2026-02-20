import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "dotenv";
import { processEntry, type ProcessPayload, type ProcessResult } from "./handlers/process.js";
import { startChat, sendChatMessage, endChat, type ChatStartPayload } from "./handlers/chat.js";
import { aggregateTodos } from "./handlers/todo.js";
import { startASR, sendAudioChunk, stopASR, cancelASR } from "./handlers/asr.js";
import { getSession } from "./session/manager.js";
import { Router } from "./router.js";
import { sendJson, sendError } from "./lib/http-helpers.js";
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

// Load environment
config({ path: "../.env.local" });
config({ path: ".env" });

const PORT = parseInt(process.env.GATEWAY_PORT ?? "3001", 10);

// ── Message types ──

type GatewayMessage =
  | { type: "process"; payload: ProcessPayload }
  | { type: "chat.start"; payload: ChatStartPayload }
  | { type: "chat.message"; payload: { text: string; deviceId: string } }
  | { type: "chat.end"; payload: { deviceId: string } }
  | { type: "todo.aggregate"; payload: { deviceId: string } }
  | { type: "asr.start"; payload: { deviceId: string; locationText?: string } }
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

// ── HTTP Server ──

const server = createServer(async (req, res) => {
  // Health check (before router for speed)
  if (req.url === "/health") {
    sendJson(res, { status: "ok", timestamp: new Date().toISOString() });
    return;
  }

  // Try router
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

// Map WebSocket connections to device IDs for binary audio routing
const connectionDeviceMap = new Map<WebSocket, string>();

function send(ws: WebSocket, msg: GatewayResponse) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on("connection", (ws) => {
  console.log("[gateway] Client connected");

  ws.on("message", async (raw, isBinary) => {
    // Binary frame: PCM audio data for ASR
    if (isBinary) {
      const deviceId = connectionDeviceMap.get(ws);
      if (deviceId) {
        sendAudioChunk(deviceId, Buffer.from(raw as Buffer));
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
        case "process": {
          const result = await processEntry(msg.payload);
          send(ws, { type: "process.result", payload: result });
          break;
        }

        case "chat.start": {
          const stream = await startChat(msg.payload);
          let fullText = "";
          for await (const chunk of stream) {
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
          const result = await aggregateTodos(msg.payload.deviceId);
          send(ws, { type: "todo.result", payload: result });
          break;
        }

        case "asr.start": {
          connectionDeviceMap.set(ws, msg.payload.deviceId);
          await startASR(ws, msg.payload.deviceId, msg.payload.locationText);
          break;
        }

        case "asr.stop": {
          await stopASR(ws, msg.payload.deviceId, msg.payload.saveAudio);
          break;
        }

        case "asr.cancel": {
          cancelASR(msg.payload.deviceId);
          connectionDeviceMap.delete(ws);
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
      cancelASR(deviceId);
      connectionDeviceMap.delete(ws);
    }
    console.log("[gateway] Client disconnected");
  });
});

// ── Start ──

server.listen(PORT, () => {
  console.log(`[gateway] v2note Dialog Gateway running on port ${PORT}`);
  console.log(`[gateway] WebSocket: ws://localhost:${PORT}`);
  console.log(`[gateway] REST API: http://localhost:${PORT}/api/v1/`);
  console.log(`[gateway] Health: http://localhost:${PORT}/health`);
});
