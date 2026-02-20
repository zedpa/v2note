import * as memoryRepo from "../db/repositories/memory.js";
import type { MemoryEntry } from "../db/repositories/memory.js";

export type { MemoryEntry };

/**
 * Load long-term memories for a device, optionally filtered by date range.
 */
export async function loadMemory(
  deviceId: string,
  dateRange?: { start: string; end: string },
): Promise<MemoryEntry[]> {
  return memoryRepo.findByDevice(deviceId, dateRange);
}

/**
 * Save a new memory entry.
 */
export async function saveMemory(
  deviceId: string,
  content: string,
  sourceDate?: string,
  importance?: number,
): Promise<void> {
  await memoryRepo.create({
    device_id: deviceId,
    content,
    source_date: sourceDate,
    importance,
  });
}
