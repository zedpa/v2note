import { WebSocket as WsWebSocket } from "ws";
export type ASRMode = "realtime" | "upload";
/**
 * Start ASR session.
 * - realtime: connect to DashScope Realtime WebSocket for streaming ASR.
 * - upload: just accumulate PCM chunks; transcribe when recording stops.
 */
export declare function startASR(clientWs: WsWebSocket, deviceId: string, locationText?: string, mode?: ASRMode): Promise<void>;
/**
 * Forward binary PCM audio chunk.
 * - realtime: sends to DashScope WebSocket
 * - upload: accumulates in memory
 */
export declare function sendAudioChunk(deviceId: string, chunk: Buffer): void;
/**
 * Stop ASR session.
 * - realtime: send finish-task to DashScope
 * - upload: transcribe accumulated audio via REST API
 */
export declare function stopASR(clientWs: WsWebSocket, deviceId: string, saveAudio?: boolean): Promise<void>;
/**
 * Cancel ASR session.
 */
export declare function cancelASR(deviceId: string): void;
/**
 * Check if a session exists for the given device.
 */
export declare function getSessionDeviceId(deviceId: string): boolean;
