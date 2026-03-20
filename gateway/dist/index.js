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
import { getProactiveEngine } from "./proactive/engine.js";
import { verifyAccessToken } from "./auth/jwt.js";
import { generateAiStatus } from "./handlers/reflect.js";
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
registerDailyLoopRoutes(router);
registerGoalRoutes(router);
registerProfileRoutes(router);
registerNotebookRoutes(router);
registerMCPServerRoutes(router);
registerAuthRoutes(router);
registerReleaseRoutes(router);
registerStrikeRoutes(router);
registerCognitiveStatsRoutes(router);
// ── HTTP Server ──
const server = createServer(async (req, res) => {
    // CORS for all requests (including /health and non-router paths)
    if (handleCors(req, res))
        return;
    // Health check (before router for speed)
    if (req.url === "/health") {
        sendJson(res, { status: "ok", timestamp: new Date().toISOString() });
        return;
    }
    // Try router (CORS already handled above)
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
// Map WebSocket connections to device IDs and user IDs
const connectionDeviceMap = new Map();
const connectionUserMap = new Map();
function send(ws, msg) {
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
                sendAudioChunk(deviceId, Buffer.from(raw), ws);
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
                    }
                    catch {
                        send(ws, { type: "error", payload: { message: "Authentication failed" } });
                    }
                    break;
                }
                case "process": {
                    // Inject userId from WebSocket auth
                    const userId = connectionUserMap.get(ws);
                    if (userId)
                        msg.payload.userId = userId;
                    const result = await processEntry(msg.payload);
                    send(ws, { type: "process.result", payload: result });
                    break;
                }
                case "chat.start": {
                    // Inject userId from WebSocket auth
                    const userId = connectionUserMap.get(ws);
                    if (userId)
                        msg.payload.userId = userId;
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
//# sourceMappingURL=index.js.map