import * as memoryRepo from "../db/repositories/memory.js";
import type { MemoryEntry } from "../db/repositories/memory.js";

export type { MemoryEntry };

/**
 * Load long-term memories for a device/user, optionally filtered by date range.
 */
export async function loadMemory(
  deviceId: string,
  dateRange?: { start: string; end: string },
  userId?: string,
): Promise<MemoryEntry[]> {
  if (userId) {
    return memoryRepo.findByUser(userId, dateRange);
  }
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
  userId?: string,
): Promise<void> {
  await memoryRepo.create({
    device_id: deviceId,
    user_id: userId,
    content,
    source_date: sourceDate,
    importance,
  });
}
