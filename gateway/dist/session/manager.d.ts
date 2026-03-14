import { SessionContext } from "./context.js";
import { MemoryManager } from "../memory/manager.js";
export interface Session {
    id: string;
    deviceId: string;
    userId?: string;
    context: SessionContext;
    mode: "idle" | "process" | "chat";
    memoryManager: MemoryManager;
    createdAt: Date;
    lastActivity: Date;
}
/**
 * Get or create a session for a device.
 */
export declare function getSession(deviceId: string): Session;
/**
 * Remove a session.
 */
export declare function removeSession(deviceId: string): void;
/**
 * Clean up stale sessions.
 */
export declare function cleanupSessions(): void;
