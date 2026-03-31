import { WebSocket as WsWebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { getVocabularyIdForDevice } from "../cognitive/vocabulary-sync.js";
import { processEntry } from "./process.js";
import { matchVoiceCommand } from "./voice-commands.js";
import { generateReflection } from "./reflect.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ASR_UPLOAD_SCRIPT = join(__dirname, "../../scripts/asr_transcribe.py");
const ASR_REALTIME_SCRIPT = join(__dirname, "../../scripts/asr_realtime.py");
const PYTHON = process.platform === "win32" ? "python" : "python3";
const sessions = new Map();
/**
 * Start ASR session.
 * - realtime: spawn Python realtime ASR subprocess for streaming recognition.
 * - upload: just accumulate PCM chunks; transcribe when recording stops.
 */
export async function startASR(clientWs, deviceId, locationText, mode = "realtime", notebook, userId) {
    const asrT0 = Date.now();
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
        throw new Error("Missing DASHSCOPE_API_KEY");
    const existingSession = sessions.get(deviceId);
    if (existingSession) {
        if (existingSession.pythonProcess) {
            console.log(`[asr] Killing existing Python process (PID: ${existingSession.pythonProcess.pid}) for device ${deviceId}`);
            // Send SIGKILL to ensure immediate termination
            existingSession.pythonProcess.kill('SIGKILL');
        }
        sessions.delete(deviceId);
        console.warn(`[asr] Replaced existing ASR session for device ${deviceId}`);
    }
    const taskId = randomUUID();
    const session = {
        deviceId,
        userId,
        ownerWs: clientWs,
        mode,
        pythonProcess: null,
        taskId,
        sentences: [],
        partialText: "",
        locationText,
        notebook,
        audioChunks: [],
        saveAudio: false,
        startTime: Date.now(),
    };
    sessions.set(deviceId, session);
    console.log(`[asr][⏱ session-create] ${Date.now() - asrT0}ms`);
    if (mode === "upload") {
        // Upload mode: no subprocess, just accumulate chunks
        console.log(`[asr] Upload mode started for device ${deviceId}`);
        return;
    }
    // 查询用户的 DashScope 热词 ID（用户维度，跨设备共享）
    const tVocab = Date.now();
    const vocabularyId = await getVocabularyIdForDevice(deviceId);
    console.log(`[asr][⏱ vocabulary-query] ${Date.now() - tVocab}ms — buffered chunks during wait: ${session.audioChunks.length}`);
    // Realtime mode: spawn Python streaming ASR process
    const spawnEnv = {
        ...process.env,
        DASHSCOPE_API_KEY: apiKey,
        ASR_MODEL: process.env.ASR_MODEL || "fun-asr-realtime",
        PYTHONIOENCODING: "utf-8",
    };
    if (vocabularyId)
        spawnEnv.ASR_VOCABULARY_ID = vocabularyId;
    const tSpawn = Date.now();
    const py = spawn(PYTHON, [ASR_REALTIME_SCRIPT], {
        env: spawnEnv,
        stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`[asr][⏱ python-spawn] ${Date.now() - tSpawn}ms — PID: ${py.pid}`);
    session.pythonProcess = py;
    // Flush any audio chunks that arrived while we were awaiting vocabularyId
    const bufferedCount = session.audioChunks.length;
    const bufferedBytes = session.audioChunks.reduce((sum, c) => sum + c.length, 0);
    if (bufferedCount > 0) {
        console.log(`[asr][⏱ flush] ${bufferedCount} chunks (${bufferedBytes} bytes = ${(bufferedBytes / 32000).toFixed(1)}s audio) → Python stdin`);
        for (const buffered of session.audioChunks) {
            try {
                py.stdin.write(buffered);
            }
            catch {
                // Python stdin not ready yet — will be picked up on next chunk
                break;
            }
        }
    }
    console.log(`[asr][⏱ startASR-total] ${Date.now() - asrT0}ms — Python launched, waiting for "started" event`);
    // Read JSON lines from Python stdout
    const rl = createInterface({ input: py.stdout });
    rl.on("line", (line) => {
        try {
            const event = JSON.parse(line);
            handleRealtimeEvent(clientWs, deviceId, taskId, event);
        }
        catch (err) {
            console.error("[asr] Failed to parse Python event:", line, err);
        }
    });
    py.stderr.on("data", (data) => {
        console.error(`[asr] Python stderr (PID: ${py.pid}): ${data.toString().trim()}`);
    });
    py.on("error", (err) => {
        const sess = sessions.get(deviceId);
        if (!sess || sess.taskId !== taskId || sess.pythonProcess !== py)
            return;
        console.error(`[asr] Python process error (PID: ${py.pid}):`, err);
        sendToClient(clientWs, {
            type: "asr.error",
            payload: { message: "ASR process error" },
        });
        sessions.delete(deviceId);
    });
    py.on("close", (code) => {
        console.log(`[asr] Python realtime process (PID: ${py.pid}) exited with code ${code} for device ${deviceId}`);
        const sess = sessions.get(deviceId);
        // Only finish if this is still the active session AND it hasn't been replaced
        if (sess && sess.taskId === taskId && sess.pythonProcess === py) {
            finishRealtimeASR(clientWs, deviceId, taskId).catch((err) => {
                console.error("[asr] Finish error:", err);
            });
        }
        else {
            console.log(`[asr] Python process (PID: ${py.pid}) close event ignored (session replaced or mismatched)`);
        }
    });
    console.log(`[asr] Realtime mode started (Python SDK) for device ${deviceId}`);
}
/**
 * Handle a JSON event from the Python realtime ASR process.
 */
function handleRealtimeEvent(clientWs, deviceId, taskId, event) {
    const session = sessions.get(deviceId);
    if (!session || session.taskId !== taskId || session.ownerWs !== clientWs)
        return;
    switch (event.type) {
        case "started": {
            const elapsed = Date.now() - session.startTime;
            const totalChunks = session.audioChunks.length;
            const totalBytes = session.audioChunks.reduce((s, c) => s + c.length, 0);
            console.log(`[asr][⏱ python-ready] ${elapsed}ms since asr.start — Python ASR ready to receive audio`);
            console.log(`[asr][⏱ chunks-status] ${totalChunks} chunks (${totalBytes} bytes = ${(totalBytes / 32000).toFixed(1)}s audio) accumulated so far`);
            break;
        }
        case "sentence": {
            const sid = event.sentence_id ?? 0;
            if (session.sentences.length === 0) {
                console.log(`[asr][⏱ first-sentence] ${Date.now() - session.startTime}ms — "${event.text?.slice(0, 40)}" begin_time=${event.begin_time}ms`);
            }
            const existing = session.sentences.find((s) => s.sentenceId === sid);
            if (existing) {
                existing.text = event.text;
                existing.begin_time = event.begin_time;
                existing.end_time = event.end_time;
            }
            else {
                session.sentences.push({
                    text: event.text,
                    sentenceId: sid,
                    begin_time: event.begin_time,
                    end_time: event.end_time,
                });
                sendToClient(clientWs, {
                    type: "asr.sentence",
                    payload: {
                        text: event.text,
                        sentenceId: sid,
                        begin_time: event.begin_time,
                        end_time: event.end_time,
                    },
                });
            }
            break;
        }
        case "partial":
            if (!session.partialText && event.text) {
                console.log(`[asr][⏱ first-partial] ${Date.now() - session.startTime}ms — "${(event.text ?? "").slice(0, 40)}"`);
            }
            session.partialText = event.text ?? "";
            sendToClient(clientWs, {
                type: "asr.partial",
                payload: {
                    text: event.text ?? "",
                    sentenceId: event.sentence_id ?? 0,
                },
            });
            break;
        case "error":
            console.error(`[asr] Python ASR error: ${event.message}`);
            sendToClient(clientWs, {
                type: "asr.error",
                payload: { message: event.message },
            });
            break;
        case "complete":
            console.log(`[asr] Python ASR complete for device ${deviceId}`);
            finishRealtimeASR(clientWs, deviceId, taskId).catch((err) => {
                console.error("[asr] Finish error:", err);
            });
            break;
    }
}
/**
 * Forward binary PCM audio chunk.
 * - realtime: writes to Python subprocess stdin
 * - upload: accumulates in memory
 */
export function sendAudioChunk(deviceId, chunk, sourceWs) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    if (sourceWs && session.ownerWs !== sourceWs)
        return;
    // Debug: log first few chunks with timing
    const chunkIdx = session.audioChunks.length;
    const sinceStart = Date.now() - session.startTime;
    if (chunkIdx < 10 || chunkIdx % 50 === 0) {
        const pyReady = session.pythonProcess?.stdin?.writable ? "→py" : "→buf";
        console.log(`[asr] chunk#${chunkIdx} +${sinceStart}ms ${chunk.length}B ${pyReady}`);
    }
    if (session.mode === "upload") {
        // Upload mode: always accumulate chunks
        session.audioChunks.push(Buffer.from(chunk));
        return;
    }
    // Always accumulate audio (for flush-on-ready + potential playback)
    session.audioChunks.push(Buffer.from(chunk));
    // Realtime mode: forward to Python process stdin
    if (session.pythonProcess?.stdin?.writable) {
        try {
            session.pythonProcess.stdin.write(chunk, (err) => {
                if (err) {
                    console.error(`[asr] Write error to Python (PID: ${session.pythonProcess?.pid}):`, err);
                }
            });
        }
        catch (err) {
            console.error(`[asr] Write exception to Python (PID: ${session.pythonProcess?.pid}):`, err);
        }
    }
    // If pythonProcess not ready yet, chunk is buffered in audioChunks and will be flushed when process spawns
}
/**
 * Stop ASR session.
 * - realtime: close Python subprocess stdin (signals EOF → stop)
 * - upload: transcribe accumulated audio via Python subprocess
 */
export async function stopASR(clientWs, deviceId, saveAudio, forceCommand) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    if (session.ownerWs !== clientWs)
        return;
    const totalDuration = Date.now() - session.startTime;
    const totalChunks = session.audioChunks.length;
    const totalBytes = session.audioChunks.reduce((s, c) => s + c.length, 0);
    console.log(`[asr][⏱ stop] ${totalDuration}ms — ${totalChunks} chunks, ${totalBytes} bytes (${(totalBytes / 32000).toFixed(1)}s audio)`);
    if (saveAudio)
        session.saveAudio = true;
    if (forceCommand)
        session.forceCommand = true;
    if (session.mode === "upload") {
        finishUploadASR(clientWs, deviceId, session.taskId).catch((err) => {
            console.error("[asr] Upload finish error:", err);
            sendToClient(clientWs, {
                type: "asr.error",
                payload: { message: `识别失败: ${err.message}` },
            });
            sessions.delete(deviceId);
        });
        return;
    }
    // Realtime mode: close stdin to signal Python process to stop
    if (session.pythonProcess?.stdin?.writable) {
        session.pythonProcess.stdin.end();
    }
    // The "complete" event and process close will trigger finishRealtimeASR
}
/**
 * Internal: called when Python ASR sends "complete" event or process exits (realtime mode).
 */
async function finishRealtimeASR(clientWs, deviceId, expectedTaskId) {
    const session = sessions.get(deviceId);
    // Remove "session.ownerWs !== clientWs" check for internal cleanup
    if (!session || session.taskId !== expectedTaskId)
        return;
    // Prevent double-finish
    sessions.delete(deviceId);
    // Combine all confirmed sentences
    const transcript = session.sentences.map((s) => s.text).join("");
    if (!transcript.trim()) {
        sendToClient(clientWs, {
            type: "asr.done",
            payload: { transcript: "", recordId: "", duration: 0 },
        });
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
        return;
    }
    // Calculate duration from last sentence end_time
    const lastSentence = session.sentences[session.sentences.length - 1];
    const durationMs = lastSentence?.end_time ?? 0;
    const durationSeconds = Math.round(durationMs / 1000);
    await createRecordAndProcess(clientWs, session, transcript, durationSeconds);
}
/**
 * Internal: called when recording stops in upload mode.
 * Converts PCM to WAV, calls Python SDK for transcription.
 */
async function finishUploadASR(clientWs, deviceId, expectedTaskId) {
    const session = sessions.get(deviceId);
    if (!session || session.taskId !== expectedTaskId || session.ownerWs !== clientWs)
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
    // Transcribe via Python SDK
    // 查询用户的 DashScope 热词 ID（用户维度，跨设备共享）
    const uploadVocabId = await getVocabularyIdForDevice(session.deviceId);
    const transcript = await transcribeAudioFile(wavBuffer, uploadVocabId);
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
        user_id: session.userId,
        status: "processing",
        source: "voice",
        duration_seconds: durationSeconds,
        location_text: session.locationText,
        notebook: session.notebook,
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
    // Save audio to OSS and update record with the URL
    if (session.audioChunks.length > 0) {
        try {
            const { uploadPCM, isOssConfigured } = await import("../storage/oss.js");
            if (isOssConfigured()) {
                const audioUrl = await uploadPCM(session.deviceId, session.audioChunks);
                await recordRepo.updateFields(record.id, { audio_path: audioUrl });
            }
        }
        catch (err) {
            console.error("[asr] OSS audio upload failed:", err);
        }
    }
    // Trigger AI processing in background
    processEntry({
        text: transcript,
        deviceId: session.deviceId,
        userId: session.userId,
        recordId: record.id,
        notebook: session.notebook,
        forceCommand: session.forceCommand,
    })
        .then(async (result) => {
        console.log(`[asr] Process result for ${record.id}: ${JSON.stringify(result)}`);
        sendToClient(clientWs, {
            type: "process.result",
            payload: result,
        });
        // Generate reflection question in background
        try {
            const question = await generateReflection(transcript, session.deviceId, session.userId);
            if (question) {
                sendToClient(clientWs, {
                    type: "reflect.question",
                    payload: { question },
                });
            }
        }
        catch (err) {
            console.warn("[asr] Reflect failed:", err.message);
        }
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
 * Transcribe a WAV audio buffer via Python DashScope SDK subprocess.
 * Pipes WAV data to stdin, reads JSON result from stdout.
 */
async function transcribeAudioFile(wavBuffer, vocabularyId) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
        throw new Error("Missing DASHSCOPE_API_KEY");
    return new Promise((resolve, reject) => {
        const uploadEnv = {
            ...process.env,
            DASHSCOPE_API_KEY: apiKey,
            ASR_MODEL: process.env.ASR_MODEL || "fun-asr-realtime",
            PYTHONIOENCODING: "utf-8",
        };
        if (vocabularyId)
            uploadEnv.ASR_VOCABULARY_ID = vocabularyId;
        const py = spawn(PYTHON, [ASR_UPLOAD_SCRIPT], {
            env: uploadEnv,
            stdio: ["pipe", "pipe", "pipe"],
        });
        const stdoutChunks = [];
        const stderrChunks = [];
        py.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
        py.stderr.on("data", (chunk) => stderrChunks.push(chunk));
        py.on("error", (err) => {
            reject(new Error(`Failed to spawn Python ASR process: ${err.message}`));
        });
        py.on("close", (code) => {
            const stdout = Buffer.concat(stdoutChunks).toString("utf-8").trim();
            const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
            if (stderr) {
                console.error(`[asr] Python stderr: ${stderr}`);
            }
            if (code !== 0) {
                reject(new Error(`Python ASR exited with code ${code}: ${stdout || stderr}`));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                if (result.error) {
                    reject(new Error(`Python ASR error: ${result.error}`));
                    return;
                }
                resolve(result.text ?? "");
            }
            catch {
                reject(new Error(`Failed to parse Python ASR output: ${stdout}`));
            }
        });
        // Pipe WAV data to Python stdin
        py.stdin.write(wavBuffer);
        py.stdin.end();
    });
}
/**
 * Cancel ASR session.
 */
export function cancelASR(deviceId, clientWs) {
    const session = sessions.get(deviceId);
    if (!session)
        return;
    if (clientWs && session.ownerWs !== clientWs)
        return;
    if (session.pythonProcess) {
        console.log(`[asr] Cancelling session, killing Python process (PID: ${session.pythonProcess.pid})`);
        session.pythonProcess.kill('SIGKILL');
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