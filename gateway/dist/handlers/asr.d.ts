import { WebSocket as WsWebSocket } from "ws";
export type ASRMode = "realtime" | "upload";
/**
 * Start ASR session.
 * - realtime: spawn Python realtime ASR subprocess for streaming recognition.
 * - upload: just accumulate PCM chunks; transcribe when recording stops.
 */
export declare function startASR(clientWs: WsWebSocket, deviceId: string, locationText?: string, mode?: ASRMode, notebook?: string, userId?: string, sourceContext?: "todo" | "timeline" | "chat" | "review", saveAudio?: boolean): Promise<void>;
/**
 * Forward binary PCM audio chunk.
 * - realtime: writes to Python subprocess stdin
 * - upload: accumulates in memory
 */
export declare function sendAudioChunk(deviceId: string, chunk: Buffer, sourceWs?: WsWebSocket): void;
/**
 * Stop ASR session.
 * - realtime: close Python subprocess stdin (signals EOF → stop)
 * - upload: transcribe accumulated audio via Python subprocess
 */
export declare function stopASR(clientWs: WsWebSocket, deviceId: string, saveAudio?: boolean, forceCommand?: boolean): Promise<void>;
/**
 * Transcribe a WAV audio buffer via Python DashScope SDK subprocess.
 * Pipes WAV data to stdin, reads JSON result from stdout.
 */
export declare function transcribeAudioFile(wavBuffer: Buffer, vocabularyId?: string): Promise<string>;
/**
 * Cancel ASR session.
 */
export declare function cancelASR(deviceId: string, clientWs?: WsWebSocket): void;
/**
 * Check if a session exists for the given device.
 */
export declare function getSessionDeviceId(deviceId: string): boolean;
