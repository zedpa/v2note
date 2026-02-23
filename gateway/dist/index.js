import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "dotenv";
import { processEntry } from "./handlers/process.js";
import { startChat, sendChatMessage, endChat } from "./handlers/chat.js";
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
import { getProactiveEngine } from "./proactive/engine.js";
// Load environment
config({ path: "../.env.local" });
config({ path: ".env" });
const PORT = parseInt(process.env.GATEWAY_PORT ?? "3001", 10);
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
    if (handled)
        return;
    // Legacy REST endpoint for process
    if (req.url === "/api/process" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body);
                const result = await processEntry(payload);
                sendJson(res, result);
            }
            catch (err) {
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
const connectionDeviceMap = new Map();
function send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
const proactiveEngine = getProactiveEngine();
proactiveEngine.start();
wss.on("connection", (ws) => {
    console.log("[gateway] Client connected");
    ws.on("message", async (raw, isBinary) => {
        // Binary frame: PCM audio data for ASR
        if (isBinary) {
            const deviceId = connectionDeviceMap.get(ws);
            if (deviceId) {
                sendAudioChunk(deviceId, Buffer.from(raw));
            }
            return;
        }
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch {
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
                    const stream = await sendChatMessage(msg.payload.deviceId, msg.payload.text);
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
                    proactiveEngine.registerDevice(msg.payload.deviceId, ws);
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
                        payload: { message: `Unknown message type: ${msg.type}` },
                    });
            }
        }
        catch (err) {
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
//# sourceMappingURL=index.js.map