import type { MemoryEntry } from "../db/repositories/memory.js";
export type { MemoryEntry };
/**
 * Load long-term memories for a device, optionally filtered by date range.
 */
export declare function loadMemory(deviceId: string, dateRange?: {
    start: string;
    end: string;
}): Promise<MemoryEntry[]>;
/**
 * Save a new memory entry.
 */
export declare function saveMemory(deviceId: string, content: string, sourceDate?: string, importance?: number): Promise<void>;
