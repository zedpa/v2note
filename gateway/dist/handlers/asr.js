import { WebSocket as WsWebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { processEntry } from "./process.js";
import { matchVoiceCommand } from "./voice-commands.js";
const sessions = new Map();
const DASHSCOPE_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/";
const DASHSCOPE_REST_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
/**
 * Start ASR session.
 * - realtime: connect to DashScope Realtime WebSocket for streaming ASR.
 * - upload: just accumulate PCM chunks; transcribe when recording stops.
 */
export async function startASR(clientWs, deviceId, locationText, mode = "realtime") {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
        throw new Error("Missing DASHSCOPE_API_KEY");
    const taskId = randomUUID();
    const session = {
        deviceId,
        mode,
        dashscopeWs: null,
        taskId,
        sentences: [],
        partialText: "",
        locationText,
        audioChunks: [],
        saveAudio: false,
        startTime: Date.now(),
    };
    sessions.set(deviceId, session);
    if (mode === "upload") {
        // Upload mode: no DashScope WebSocket, just accumulate chunks
        console.log(`[asr] Upload mode started for device ${deviceId}`);
        return;
    }
    // Realtime mode: connect to DashScope WebSocket
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
                model: "fun-asr-realtime",
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
                const sid = sentence.sentence_id ?? 0;
                if (sentence.end_time !== undefined && sentence.begin_time !== undefined) {
                    // Confirmed sentence — deduplicate by sentence_id
                    const existing = session.sentences.find((s) => s.sentenceId === sid);
                    if (existing) {
                        // Update existing sentence (DashScope refines same sentence_id)
                        existing.text = sentence.text;
                        existing.begin_time = sentence.begin_time;
                        existing.end_time = sentence.end_time;
                    }
                    else {
                        // New sentence
                        session.sentences.push({
                            text: sentence.text,
                            sentenceId: sid,
                            begin_time: sentence.begin_time,
                            end_time: sentence.end_time,
                        });
                        sendToClient(clientWs, {
                            type: "asr.sentence",
                            payload: {
                                text: sentence.text,
                                sentenceId: sid,
                                begin_time: sentence.begin_time,
                                end_time: sentence.end_time,
                            },
                        });
                    }
                }
                else {
                    // Partial result
                    session.partialText = sentence.text ?? "";
                    sendToClient(clientWs, {
                        type: "asr.partial",
                        payload: {
                            text: sentence.text ?? "",
                            sentenceId: sid,
                        },
                    });
                }
                return;
            }
            if (header?.event === "task-finished") {
                console.log(`[asr] Task finished: ${taskId}`);
                finishRealtimeASR(clientWs, deviceId).catch((err) => {
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
 * Forward binary PCM audio chunk.
 * - realtime: sends to DashScope WebSocket
 * - upload: accumulates in memory
 */
export function sendAudioChunk(deviceId, chunk) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    if (session.mode === "upload") {
        // Upload mode: always accumulate chunks
        session.audioChunks.push(Buffer.from(chunk));
        return;
    }
    // Realtime mode: forward to DashScope
    if (session.dashscopeWs?.readyState === WsWebSocket.OPEN) {
        session.dashscopeWs.send(chunk);
    }
    if (session.saveAudio) {
        session.audioChunks.push(Buffer.from(chunk));
    }
}
/**
 * Stop ASR session.
 * - realtime: send finish-task to DashScope
 * - upload: transcribe accumulated audio via REST API
 */
export async function stopASR(clientWs, deviceId, saveAudio) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    if (saveAudio)
        session.saveAudio = true;
    if (session.mode === "upload") {
        // Upload mode: transcribe accumulated audio
        finishUploadASR(clientWs, deviceId).catch((err) => {
            console.error("[asr] Upload finish error:", err);
            sendToClient(clientWs, {
                type: "asr.error",
                payload: { message: `识别失败: ${err.message}` },
            });
            sessions.delete(deviceId);
        });
        return;
    }
    // Realtime mode: send finish-task to DashScope
    if (!session.dashscopeWs)
        return;
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
    // The task-finished event will trigger finishRealtimeASR
}
/**
 * Internal: called when DashScope sends task-finished (realtime mode).
 */
async function finishRealtimeASR(clientWs, deviceId) {
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
    // Check if the transcript matches a voice command
    const voiceCmd = matchVoiceCommand(transcript);
    if (voiceCmd) {
        console.log(`[asr] Voice command detected: /${voiceCmd.command}`);
        sendToClient(clientWs, {
            type: "command.detected",
            payload: { command: voiceCmd.command, args: voiceCmd.args },
        });
        if (session.dashscopeWs)
            session.dashscopeWs.close();
        sessions.delete(deviceId);
        return;
    }
    // Calculate duration from last sentence end_time
    const lastSentence = session.sentences[session.sentences.length - 1];
    const durationMs = lastSentence?.end_time ?? 0;
    const durationSeconds = Math.round(durationMs / 1000);
    await createRecordAndProcess(clientWs, session, transcript, durationSeconds);
    // Cleanup
    if (session.dashscopeWs) {
        session.dashscopeWs.close();
    }
    sessions.delete(deviceId);
}
/**
 * Internal: called when recording stops in upload mode.
 * Converts PCM to WAV, calls DashScope REST API for transcription.
 */
async function finishUploadASR(clientWs, deviceId) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    const durationSeconds = Math.round((Date.now() - session.startTime) / 1000);
    if (session.audioChunks.length === 0) {
        sendToClient(clientWs, {
            type: "asr.done",
            payload: { transcript: "", recordId: "", duration: 0 },
        });
        sessions.delete(deviceId);
        return;
    }
    // Notify client that transcription is in progress
    sendToClient(clientWs, {
        type: "asr.partial",
        payload: { text: "正在识别录音...", sentenceId: 0 },
    });
    // Convert PCM chunks to WAV
    const wavBuffer = pcmToWav(session.audioChunks);
    console.log(`[asr] Upload mode: transcribing ${wavBuffer.length} bytes WAV for device ${deviceId}`);
    // Call DashScope REST API
    const transcript = await transcribeAudioFile(wavBuffer);
    if (!transcript.trim()) {
        sendToClient(clientWs, {
            type: "asr.done",
            payload: { transcript: "", recordId: "", duration: 0 },
        });
        sessions.delete(deviceId);
        return;
    }
    // Check for voice commands
    const voiceCmd = matchVoiceCommand(transcript);
    if (voiceCmd) {
        console.log(`[asr] Voice command detected: /${voiceCmd.command}`);
        sendToClient(clientWs, {
            type: "command.detected",
            payload: { command: voiceCmd.command, args: voiceCmd.args },
        });
        sessions.delete(deviceId);
        return;
    }
    await createRecordAndProcess(clientWs, session, transcript, durationSeconds);
    sessions.delete(deviceId);
}
/**
 * Shared logic: create record + transcript, trigger AI processing.
 */
async function createRecordAndProcess(clientWs, session, transcript, durationSeconds) {
    const record = await recordRepo.create({
        device_id: session.deviceId,
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
            await uploadPCM(session.deviceId, session.audioChunks);
        }
        catch (err) {
            console.error("[asr] OSS upload failed:", err);
        }
    }
    // Trigger AI processing in background
    processEntry({
        text: transcript,
        deviceId: session.deviceId,
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
        sendToClient(clientWs, {
            type: "error",
            payload: { message: `AI processing failed: ${err.message}` },
        });
    });
}
/**
 * Convert PCM Int16 chunks to a WAV buffer.
 * PCM format: 16-bit signed, mono, 16kHz.
 */
function pcmToWav(chunks) {
    const pcmData = Buffer.concat(chunks);
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    // RIFF header
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcmData.length, 4);
    header.write("WAVE", 8);
    // fmt sub-chunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // sub-chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    // data sub-chunk
    header.write("data", 36);
    header.writeUInt32LE(pcmData.length, 40);
    return Buffer.concat([header, pcmData]);
}
/**
 * Call DashScope REST API to transcribe a WAV audio buffer.
 * Uses qwen3-asr-flash model with base64 audio input (sync, up to 5min).
 */
async function transcribeAudioFile(wavBuffer) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
        throw new Error("Missing DASHSCOPE_API_KEY");
    const base64Audio = wavBuffer.toString("base64");
    const dataUri = `data:audio/wav;base64,${base64Audio}`;
    const body = {
        model: "qwen3-asr-flash",
        input: {
            messages: [
                { role: "system", content: [{ text: "" }] },
                { role: "user", content: [{ audio: dataUri }] },
            ],
        },
        parameters: {
            asr_options: { enable_itn: false },
        },
    };
    const res = await fetch(DASHSCOPE_REST_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`DashScope transcription API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    // Response: { output: { choices: [{ message: { content: [{ text: "..." }] } }] } }
    const choices = data.output?.choices;
    if (Array.isArray(choices) && choices.length > 0) {
        const content = choices[0]?.message?.content;
        if (Array.isArray(content)) {
            return content.map((c) => c.text ?? "").join("");
        }
        if (typeof content === "string")
            return content;
    }
    return "";
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
 * Check if a session exists for the given device.
 */
export function getSessionDeviceId(deviceId) {
    return sessions.has(deviceId);
}
//# sourceMappingURL=asr.js.map