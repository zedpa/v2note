import { WebSocket as WsWebSocket } from "ws";
/**
 * Start ASR session: connect to DashScope Realtime, send run-task.
 */
export declare function startASR(clientWs: WsWebSocket, deviceId: string, locationText?: string): Promise<void>;
/**
 * Forward binary PCM audio chunk to DashScope.
 */
export declare function sendAudioChunk(deviceId: string, chunk: Buffer): void;
/**
 * Stop ASR: send finish-task to DashScope.
 */
export declare function stopASR(clientWs: WsWebSocket, deviceId: string, saveAudio?: boolean): Promise<void>;
/**
 * Cancel ASR session.
 */
export declare function cancelASR(deviceId: string): void;
/**
 * Get the device ID for a given WebSocket connection.
 */
export declare function getSessionDeviceId(deviceId: string): boolean;
