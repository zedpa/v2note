import { WebSocket as WsWebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { processEntry } from "./process.js";
const sessions = new Map();
const DASHSCOPE_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/";
/**
 * Start ASR session: connect to DashScope Realtime, send run-task.
 */
export async function startASR(clientWs, deviceId, locationText) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
        throw new Error("Missing DASHSCOPE_API_KEY");
    const taskId = randomUUID();
    const session = {
        deviceId,
        dashscopeWs: null,
        taskId,
        sentences: [],
        partialText: "",
        locationText,
        audioChunks: [],
        saveAudio: false,
    };
    sessions.set(deviceId, session);
    // Connect to DashScope
    const dsWs = new WsWebSocket(DASHSCOPE_WS_URL, {
        headers: { Authorization: `bearer ${apiKey}` },
    });
    session.dashscopeWs = dsWs;
    dsWs.on("open", () => {
        // Send run-task message
        const runTask = {
            header: {
                action: "run-task",
                task_id: taskId,
                streaming: "duplex",
            },
            payload: {
                task_group: "audio",
                task: "asr",
                function: "recognition",
                model: "paraformer-realtime-v2",
                parameters: {
                    format: "pcm",
                    sample_rate: 16000,
                    vocabulary_id: "",
                    disfluency_removal_enabled: false,
                },
                input: {},
            },
        };
        dsWs.send(JSON.stringify(runTask));
    });
    dsWs.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());
            const header = msg.header;
            const payload = msg.payload;
            if (header?.event === "task-started") {
                console.log(`[asr] Task started: ${taskId}`);
                return;
            }
            if (header?.event === "result-generated") {
                const output = payload?.output;
                if (!output?.sentence)
                    return;
                const sentence = output.sentence;
                if (sentence.end_time !== undefined && sentence.begin_time !== undefined) {
                    // Final sentence
                    session.sentences.push({
                        text: sentence.text,
                        sentenceId: sentence.sentence_id ?? session.sentences.length,
                        begin_time: sentence.begin_time,
                        end_time: sentence.end_time,
                    });
                    sendToClient(clientWs, {
                        type: "asr.sentence",
                        payload: {
                            text: sentence.text,
                            sentenceId: sentence.sentence_id ?? session.sentences.length - 1,
                            begin_time: sentence.begin_time,
                            end_time: sentence.end_time,
                        },
                    });
                }
                else {
                    // Partial result
                    session.partialText = sentence.text ?? "";
                    sendToClient(clientWs, {
                        type: "asr.partial",
                        payload: {
                            text: sentence.text ?? "",
                            sentenceId: sentence.sentence_id ?? 0,
                        },
                    });
                }
                return;
            }
            if (header?.event === "task-finished") {
                console.log(`[asr] Task finished: ${taskId}`);
                finishASR(clientWs, deviceId).catch((err) => {
                    console.error("[asr] Finish error:", err);
                });
                return;
            }
            if (header?.event === "task-failed") {
                const errMsg = header?.error_message ?? "ASR task failed";
                console.error(`[asr] Task failed: ${errMsg}`);
                sendToClient(clientWs, {
                    type: "asr.error",
                    payload: { message: errMsg },
                });
                sessions.delete(deviceId);
                return;
            }
        }
        catch (err) {
            console.error("[asr] Failed to parse DashScope message:", err);
        }
    });
    dsWs.on("error", (err) => {
        console.error("[asr] DashScope WS error:", err);
        sendToClient(clientWs, {
            type: "asr.error",
            payload: { message: "ASR connection error" },
        });
        sessions.delete(deviceId);
    });
    dsWs.on("close", () => {
        console.log(`[asr] DashScope WS closed for device ${deviceId}`);
    });
}
/**
 * Forward binary PCM audio chunk to DashScope.
 */
export function sendAudioChunk(deviceId, chunk) {
    const session = sessions.get(deviceId);
    if (!session?.dashscopeWs)
        return;
    if (session.dashscopeWs.readyState === WsWebSocket.OPEN) {
        session.dashscopeWs.send(chunk);
    }
    if (session.saveAudio) {
        session.audioChunks.push(Buffer.from(chunk));
    }
}
/**
 * Stop ASR: send finish-task to DashScope.
 */
export async function stopASR(clientWs, deviceId, saveAudio) {
    const session = sessions.get(deviceId);
    if (!session?.dashscopeWs)
        return;
    if (saveAudio)
        session.saveAudio = true;
    // Send finish-task
    const finishMsg = {
        header: {
            action: "finish-task",
            task_id: session.taskId,
            streaming: "duplex",
        },
        payload: {
            input: {},
        },
    };
    if (session.dashscopeWs.readyState === WsWebSocket.OPEN) {
        session.dashscopeWs.send(JSON.stringify(finishMsg));
    }
    // The task-finished event will trigger finishASR
}
/**
 * Internal: called when DashScope sends task-finished.
 * Creates record + transcript and triggers AI processing.
 */
async function finishASR(clientWs, deviceId) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    // Combine all confirmed sentences
    const transcript = session.sentences.map((s) => s.text).join("");
    if (!transcript.trim()) {
        sendToClient(clientWs, {
            type: "asr.done",
            payload: { transcript: "", recordId: "", duration: 0 },
        });
        sessions.delete(deviceId);
        return;
    }
    // Calculate duration from last sentence end_time
    const lastSentence = session.sentences[session.sentences.length - 1];
    const durationMs = lastSentence?.end_time ?? 0;
    const durationSeconds = Math.round(durationMs / 1000);
    // Create record and transcript
    const record = await recordRepo.create({
        device_id: deviceId,
        status: "processing",
        source: "voice",
        duration_seconds: durationSeconds,
        location_text: session.locationText,
    });
    await transcriptRepo.create({
        record_id: record.id,
        text: transcript,
        language: "zh",
    });
    sendToClient(clientWs, {
        type: "asr.done",
        payload: {
            transcript,
            recordId: record.id,
            duration: durationSeconds,
        },
    });
    // Optional: save audio to OSS
    if (session.saveAudio && session.audioChunks.length > 0) {
        try {
            const { uploadPCM } = await import("../storage/oss.js");
            await uploadPCM(deviceId, session.audioChunks);
        }
        catch (err) {
            console.error("[asr] OSS upload failed:", err);
        }
    }
    // Trigger AI processing in background
    processEntry({
        text: transcript,
        deviceId,
        recordId: record.id,
    })
        .then((result) => {
        sendToClient(clientWs, {
            type: "process.result",
            payload: result,
        });
    })
        .catch((err) => {
        console.error("[asr] Process error:", err);
    });
    // Cleanup
    if (session.dashscopeWs) {
        session.dashscopeWs.close();
    }
    sessions.delete(deviceId);
}
/**
 * Cancel ASR session.
 */
export function cancelASR(deviceId) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    if (session.dashscopeWs) {
        session.dashscopeWs.close();
    }
    sessions.delete(deviceId);
    console.log(`[asr] Session cancelled for device ${deviceId}`);
}
function sendToClient(ws, msg) {
    if (ws.readyState === WsWebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
/**
 * Get the device ID for a given WebSocket connection.
 */
export function getSessionDeviceId(deviceId) {
    return sessions.has(deviceId);
}
//# sourceMappingURL=asr.js.map