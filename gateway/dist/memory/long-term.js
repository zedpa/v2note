import * as memoryRepo from "../db/repositories/memory.js";
/**
 * Load long-term memories for a device, optionally filtered by date range.
 */
export async function loadMemory(deviceId, dateRange) {
    return memoryRepo.findByDevice(deviceId, dateRange);
}
/**
 * Save a new memory entry.
 */
export async function saveMemory(deviceId, content, sourceDate, importance) {
    await memoryRepo.create({
        device_id: deviceId,
        content,
        source_date: sourceDate,
        importance,
    });
}
//# sourceMappingURL=long-term.js.map