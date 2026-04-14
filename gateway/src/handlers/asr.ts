import { WebSocket as WsWebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createWriteStream, readFileSync, unlinkSync, mkdirSync, readdirSync, type WriteStream } from "node:fs";
import { recordRepo } from "../db/repositories/index.js";
import { transcriptRepo } from "../db/repositories/index.js";
import { getVocabularyIdForDevice } from "../cognitive/vocabulary-sync.js";
import { processEntry } from "./process.js";
import { matchVoiceCommand } from "./voice-commands.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ASR_UPLOAD_SCRIPT = join(__dirname, "../../scripts/asr_transcribe.py");
const ASR_REALTIME_SCRIPT = join(__dirname, "../../scripts/asr_realtime.py");
const PYTHON = process.platform === "win32" ? "python" : "python3";

// 音频临时文件目录
const ASR_TMP_DIR = process.env.CACHE_DIR
  ? join(process.env.CACHE_DIR, "tmp", "asr")
  : join(process.cwd(), ".cache", "tmp", "asr");
mkdirSync(ASR_TMP_DIR, { recursive: true });

// 启动时清理孤立的临时文件
try {
  for (const f of readdirSync(ASR_TMP_DIR)) {
    if (f.endsWith(".pcm")) {
      try { unlinkSync(join(ASR_TMP_DIR, f)); } catch {}
    }
  }
} catch {}

// 最大录音时长 120 秒，16kHz 16bit mono = 32000 bytes/sec
const MAX_AUDIO_BYTES = 120 * 32000;

export type ASRMode = "realtime" | "upload";

interface ASRSession {
  userId: string;
  ownerWs: WsWebSocket;
  mode: ASRMode;
  pythonProcess: ChildProcess | null;
  taskId: string;
  sentences: Array<{ text: string; sentenceId: number; begin_time?: number; end_time?: number }>;
  partialText: string;
  locationText?: string;
  notebook?: string;
  // 磁盘音频存储（替代原来的内存 Buffer[]）
  audioFile: string;
  audioStream: WriteStream;
  audioBytes: number;
  audioChunkCount: number;
  // 仅 realtime 模式：Python 未就绪时的临时缓冲（就绪后清空）
  preFlushBuffer: Buffer[];
  saveAudio: boolean;
  transcriptOnly: boolean;
  startTime: number;
  forceCommand?: boolean;
  sourceContext?: "todo" | "timeline" | "chat" | "review";
}

const sessions = new Map<string, ASRSession>();

/**
 * Start ASR session.
 * - realtime: spawn Python realtime ASR subprocess for streaming recognition.
 * - upload: just accumulate PCM chunks; transcribe when recording stops.
 */
export async function startASR(
  clientWs: WsWebSocket,
  userId: string,
  locationText?: string,
  mode: ASRMode = "realtime",
  notebook?: string,
  _userId2?: string,
  sourceContext?: "todo" | "timeline" | "chat" | "review",
  saveAudio?: boolean,
): Promise<void> {
  const asrT0 = Date.now();
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("Missing DASHSCOPE_API_KEY");

  // Cancel 已有 ASR session（防止多设备并发覆盖导致资源泄漏）
  const existingSession = sessions.get(userId);
  if (existingSession) {
    if (existingSession.pythonProcess) {
      console.log(`[asr] Killing existing Python process (PID: ${existingSession.pythonProcess.pid}) for user ${userId}`);
      existingSession.pythonProcess.kill('SIGKILL');
    }
    cleanupSessionFiles(existingSession);
    sessions.delete(userId);
    console.warn(`[asr] Replaced existing ASR session for user ${userId}`);
  }

  const taskId = randomUUID();
  const audioFile = join(ASR_TMP_DIR, `${taskId}.pcm`);
  const audioStream = createWriteStream(audioFile);

  const session: ASRSession = {
    userId,
    ownerWs: clientWs,
    mode,
    pythonProcess: null,
    taskId,
    sentences: [],
    partialText: "",
    locationText,
    notebook,
    audioFile,
    audioStream,
    audioBytes: 0,
    audioChunkCount: 0,
    preFlushBuffer: [],
    saveAudio: false,
    transcriptOnly: saveAudio === false,
    startTime: Date.now(),
    sourceContext,
  };
  sessions.set(userId, session);
  console.log(`[asr][⏱ session-create] ${Date.now() - asrT0}ms`);

  if (mode === "upload") {
    // Upload mode: no subprocess, just accumulate chunks
    console.log(`[asr] Upload mode started for user ${userId}`);
    return;
  }

  // 查询用户的 DashScope 热词 ID（用户维度，跨设备共享）
  const tVocab = Date.now();
  const vocabularyId = await getVocabularyIdForDevice(userId);
  console.log(`[asr][⏱ vocabulary-query] ${Date.now() - tVocab}ms — buffered chunks during wait: ${session.preFlushBuffer.length}`);

  // Realtime mode: spawn Python streaming ASR process
  const spawnEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    DASHSCOPE_API_KEY: apiKey,
    ASR_MODEL: process.env.ASR_MODEL || "fun-asr-realtime",
    PYTHONIOENCODING: "utf-8",
  };
  if (vocabularyId) spawnEnv.ASR_VOCABULARY_ID = vocabularyId;

  const tSpawn = Date.now();
  const py = spawn(PYTHON, [ASR_REALTIME_SCRIPT], {
    env: spawnEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(`[asr][⏱ python-spawn] ${Date.now() - tSpawn}ms — PID: ${py.pid}`);

  session.pythonProcess = py;

  // Flush pre-ready buffer to Python stdin
  const bufferedCount = session.preFlushBuffer.length;
  const bufferedBytes = session.preFlushBuffer.reduce((sum, c) => sum + c.length, 0);
  if (bufferedCount > 0) {
    console.log(`[asr][⏱ flush] ${bufferedCount} chunks (${bufferedBytes} bytes = ${(bufferedBytes / 32000).toFixed(1)}s audio) → Python stdin`);
    for (const buffered of session.preFlushBuffer) {
      try {
        py.stdin.write(buffered);
      } catch {
        break;
      }
    }
    session.preFlushBuffer = []; // 释放内存
  }
  console.log(`[asr][⏱ startASR-total] ${Date.now() - asrT0}ms — Python launched, waiting for "started" event`);

  // Read JSON lines from Python stdout
  const rl = createInterface({ input: py.stdout });
  rl.on("line", (line) => {
    try {
      const event = JSON.parse(line);
      handleRealtimeEvent(clientWs, userId, taskId, event);
    } catch (err) {
      console.error("[asr] Failed to parse Python event:", line, err);
    }
  });

  py.stderr.on("data", (data: Buffer) => {
    console.error(`[asr] Python stderr (PID: ${py.pid}): ${data.toString().trim()}`);
  });

  py.on("error", (err) => {
    const sess = sessions.get(userId);
    if (!sess || sess.taskId !== taskId || sess.pythonProcess !== py) return;
    console.error(`[asr] Python process error (PID: ${py.pid}):`, err);
    sendToClient(clientWs, {
      type: "asr.error",
      payload: { message: "ASR process error" },
    });
    sessions.delete(userId);
  });

  py.on("close", (code) => {
    console.log(`[asr] Python realtime process (PID: ${py.pid}) exited with code ${code} for user ${userId}`);
    const sess = sessions.get(userId);
    
    // Only finish if this is still the active session AND it hasn't been replaced
    if (sess && sess.taskId === taskId && sess.pythonProcess === py) {
      finishRealtimeASR(clientWs, userId, taskId).catch((err) => {
        console.error("[asr] Finish error:", err);
      });
    } else {
        console.log(`[asr] Python process (PID: ${py.pid}) close event ignored (session replaced or mismatched)`);
    }
  });

  console.log(`[asr] Realtime mode started (Python SDK) for user ${userId}`);
}

/**
 * Handle a JSON event from the Python realtime ASR process.
 */
function handleRealtimeEvent(
  clientWs: WsWebSocket,
  userId: string,
  taskId: string,
  event: any,
): void {
  const session = sessions.get(userId);
  if (!session || session.taskId !== taskId || session.ownerWs !== clientWs) return;

  switch (event.type) {
    case "started": {
      const elapsed = Date.now() - session.startTime;
      console.log(`[asr][⏱ python-ready] ${elapsed}ms since asr.start — Python ASR ready to receive audio`);
      console.log(`[asr][⏱ chunks-status] ${session.audioChunkCount} chunks (${session.audioBytes} bytes = ${(session.audioBytes / 32000).toFixed(1)}s audio) accumulated so far`);
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
      } else {
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
      console.log(`[asr] Python ASR complete for user ${userId}`);
      finishRealtimeASR(clientWs, userId, taskId).catch((err) => {
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
export function sendAudioChunk(userId: string, chunk: Buffer, sourceWs?: WsWebSocket): void {
  const session = sessions.get(userId);
  if (!session) return;
  if (sourceWs && session.ownerWs !== sourceWs) return;

  // 录音时长限制
  if (session.audioBytes >= MAX_AUDIO_BYTES) {
    if (session.audioBytes - chunk.length < MAX_AUDIO_BYTES) {
      console.log(`[asr] Max audio duration reached (120s) for user ${userId}, auto-stopping`);
      stopASR(session.ownerWs, userId, session.saveAudio, session.forceCommand).catch(console.error);
    }
    return;
  }

  // Debug: log first few chunks with timing
  const chunkIdx = session.audioChunkCount;
  const sinceStart = Date.now() - session.startTime;
  if (chunkIdx < 10 || chunkIdx % 50 === 0) {
    const pyReady = session.pythonProcess?.stdin?.writable ? "→py" : "→buf";
    console.log(`[asr] chunk#${chunkIdx} +${sinceStart}ms ${chunk.length}B ${pyReady}`);
  }

  // 写入磁盘临时文件（替代内存 Buffer[]）
  session.audioStream.write(chunk);
  session.audioBytes += chunk.length;
  session.audioChunkCount++;

  if (session.mode === "upload") {
    return; // upload 模式只写磁盘，结束后统一读取
  }

  // Realtime 模式：转发到 Python stdin
  if (session.pythonProcess?.stdin?.writable) {
    try {
      session.pythonProcess.stdin.write(chunk, (err) => {
        if (err) {
          console.error(`[asr] Write error to Python (PID: ${session.pythonProcess?.pid}):`, err);
        }
      });
    } catch (err) {
      console.error(`[asr] Write exception to Python (PID: ${session.pythonProcess?.pid}):`, err);
    }
  } else {
    // Python 未就绪，暂存到内存缓冲（就绪后 flush 并清空）
    session.preFlushBuffer.push(Buffer.from(chunk));
  }
}

/**
 * Stop ASR session.
 * - realtime: close Python subprocess stdin (signals EOF → stop)
 * - upload: transcribe accumulated audio via Python subprocess
 */
export async function stopASR(
  clientWs: WsWebSocket,
  userId: string,
  saveAudio?: boolean,
  forceCommand?: boolean,
): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  if (session.ownerWs !== clientWs) return;

  const totalDuration = Date.now() - session.startTime;
  console.log(`[asr][⏱ stop] ${totalDuration}ms — ${session.audioChunkCount} chunks, ${session.audioBytes} bytes (${(session.audioBytes / 32000).toFixed(1)}s audio)`);

  // 关闭磁盘写入流，等待 flush 完成
  await new Promise<void>((resolve) => {
    session.audioStream.end(() => resolve());
  });

  if (saveAudio) session.saveAudio = true;
  if (forceCommand) session.forceCommand = true;

  if (session.mode === "upload") {
    finishUploadASR(clientWs, userId, session.taskId).catch((err) => {
      console.error("[asr] Upload finish error:", err);
      sendToClient(clientWs, {
        type: "asr.error",
        payload: { message: `识别失败: ${err.message}` },
      });
      sessions.delete(userId);
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
async function finishRealtimeASR(
  clientWs: WsWebSocket,
  userId: string,
  expectedTaskId: string,
): Promise<void> {
  const session = sessions.get(userId);
  // Remove "session.ownerWs !== clientWs" check for internal cleanup
  if (!session || session.taskId !== expectedTaskId) return;

  // Prevent double-finish
  sessions.delete(userId);

  // Combine all confirmed sentences
  const transcript = session.sentences.map((s) => s.text).join("");

  if (!transcript.trim()) {
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript: "", recordId: "", duration: 0 },
    });
    cleanupSessionFiles(session);
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
    cleanupSessionFiles(session);
    return;
  }

  // transcript-only 模式：只返回文本，不创建 record / 不触发 AI 处理
  if (session.transcriptOnly) {
    const lastSentence = session.sentences[session.sentences.length - 1];
    const durationMs = lastSentence?.end_time ?? 0;
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript, recordId: "", duration: Math.round(durationMs / 1000) },
    });
    cleanupSessionFiles(session);
    return;
  }

  // 指令模式：不创建 record，不存音频，只执行 processEntry Layer 2
  if (session.forceCommand) {
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript, recordId: "", duration: 0 },
    });
    cleanupSessionFiles(session);

    processEntry({
      text: transcript,
      deviceId: session.userId,
      userId: session.userId,
      notebook: session.notebook,
      forceCommand: true,
      sourceContext: session.sourceContext,
    })
      .then((result) => {
        sendToClient(clientWs, { type: "process.result", payload: result });
      })
      .catch((err) => {
        console.error("[asr] forceCommand process error:", err);
        sendToClient(clientWs, { type: "error", payload: { message: err.message } });
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
async function finishUploadASR(
  clientWs: WsWebSocket,
  userId: string,
  expectedTaskId: string,
): Promise<void> {
  const session = sessions.get(userId);
  if (!session || session.taskId !== expectedTaskId || session.ownerWs !== clientWs) return;

  const durationSeconds = Math.round((Date.now() - session.startTime) / 1000);

  if (session.audioBytes === 0) {
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript: "", recordId: "", duration: 0 },
    });
    cleanupSessionFiles(session);
    sessions.delete(userId);
    return;
  }

  // Notify client that transcription is in progress
  sendToClient(clientWs, {
    type: "asr.partial",
    payload: { text: "正在识别录音...", sentenceId: 0 },
  });

  // 从磁盘读取 PCM 数据并转换为 WAV
  const pcmData = readFileSync(session.audioFile);
  const wavBuffer = pcmToWavFromBuffer(pcmData);

  console.log(`[asr] Upload mode: transcribing ${wavBuffer.length} bytes WAV for user ${userId}`);

  // Transcribe via Python SDK
  // 查询用户的 DashScope 热词 ID（用户维度，跨设备共享）
  const uploadVocabId = await getVocabularyIdForDevice(session.userId);

  const transcript = await transcribeAudioFile(wavBuffer, uploadVocabId);

  if (!transcript.trim()) {
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript: "", recordId: "", duration: 0 },
    });
    sessions.delete(userId);
    return;
  }

  // transcript-only 模式
  if (session.transcriptOnly) {
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript, recordId: "", duration: durationSeconds },
    });
    cleanupSessionFiles(session);
    sessions.delete(userId);
    return;
  }

  // 指令模式：不创建 record，只执行 processEntry Layer 2
  if (session.forceCommand) {
    sendToClient(clientWs, {
      type: "asr.done",
      payload: { transcript, recordId: "", duration: durationSeconds },
    });
    cleanupSessionFiles(session);
    sessions.delete(userId);

    processEntry({
      text: transcript,
      deviceId: session.userId,
      userId: session.userId,
      notebook: session.notebook,
      forceCommand: true,
      sourceContext: session.sourceContext,
    })
      .then((result) => {
        sendToClient(clientWs, { type: "process.result", payload: result });
      })
      .catch((err) => {
        console.error("[asr] forceCommand process error:", err);
        sendToClient(clientWs, { type: "error", payload: { message: err.message } });
      });
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
    cleanupSessionFiles(session);
    sessions.delete(userId);
    return;
  }

  await createRecordAndProcess(clientWs, session, transcript, durationSeconds);

  sessions.delete(userId);
}

/**
 * Shared logic: create record + transcript, trigger AI processing.
 */
async function createRecordAndProcess(
  clientWs: WsWebSocket,
  session: ASRSession,
  transcript: string,
  durationSeconds: number,
): Promise<void> {
  // 根据 sourceContext 决定 record source 类型
  // Layer 1 (todo 页面) 和 Layer 2 (上滑指令) 创建隐藏 record
  const recordSource = session.sourceContext === "todo"
    ? "todo_voice"
    : session.forceCommand
      ? "command_voice"
      : "voice";

  const record = await recordRepo.create({
    user_id: session.userId,
    status: "processing",
    source: recordSource,
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
  if (session.audioBytes > 0) {
    try {
      const { uploadPCM, isOssConfigured } = await import("../storage/oss.js");
      if (isOssConfigured()) {
        // 从磁盘读取 PCM 数据，分块传入 uploadPCM
        const pcmData = readFileSync(session.audioFile);
        const audioUrl = await uploadPCM(session.userId, [pcmData]);
        await recordRepo.updateFields(record.id, { audio_path: audioUrl });
      }
    } catch (err) {
      console.error("[asr] OSS audio upload failed:", err);
    }
    // 上传完成后清理临时文件
    cleanupSessionFiles(session);
  }

  // Trigger AI processing in background
  processEntry({
    text: transcript,
    deviceId: session.userId,
    userId: session.userId,
    recordId: record.id,
    notebook: session.notebook,
    forceCommand: session.forceCommand,
    sourceContext: session.sourceContext,
  })
    .then(async (result) => {
      console.log(`[asr] Process result for ${record.id}: ${JSON.stringify(result)}`);
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
 * 清理 ASR session 的临时文件
 */
function cleanupSessionFiles(session: ASRSession): void {
  try {
    if (!session.audioStream.destroyed) session.audioStream.destroy();
    unlinkSync(session.audioFile);
  } catch {}
}

/**
 * Convert PCM buffer to a WAV buffer.
 */
function pcmToWavFromBuffer(pcmData: Buffer): Buffer {
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
export async function transcribeAudioFile(wavBuffer: Buffer, vocabularyId?: string): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("Missing DASHSCOPE_API_KEY");

  return new Promise((resolve, reject) => {
    const uploadEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      DASHSCOPE_API_KEY: apiKey,
      ASR_MODEL: process.env.ASR_MODEL || "fun-asr-realtime",
      PYTHONIOENCODING: "utf-8",
    };
    if (vocabularyId) uploadEnv.ASR_VOCABULARY_ID = vocabularyId;

    const py = spawn(PYTHON, [ASR_UPLOAD_SCRIPT], {
      env: uploadEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    py.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    py.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

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
      } catch {
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
export function cancelASR(userId: string, clientWs?: WsWebSocket): void {
  const session = sessions.get(userId);
  if (!session) return;
  if (clientWs && session.ownerWs !== clientWs) return;

  if (session.pythonProcess) {
    console.log(`[asr] Cancelling session, killing Python process (PID: ${session.pythonProcess.pid})`);
    session.pythonProcess.kill('SIGKILL');
  }
  cleanupSessionFiles(session);
  sessions.delete(userId);
  console.log(`[asr] Session cancelled for user ${userId}`);
}

function sendToClient(ws: WsWebSocket, msg: any): void {
  if (ws.readyState === WsWebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Check if a session exists for the given user.
 */
export function hasASRSession(userId: string): boolean {
  return sessions.has(userId);
}
