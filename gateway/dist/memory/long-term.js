import * as memoryRepo from "../db/repositories/memory.js";
/**
 * Load long-term memories for a device/user, optionally filtered by date range.
 */
export async function loadMemory(deviceId, dateRange, userId) {
    if (userId) {
        return memoryRepo.findByUser(userId, dateRange);
    }
    return memoryRepo.findByDevice(deviceId, dateRange);
}
/**
 * Save a new memory entry.
 */
export async function saveMemory(deviceId, content, sourceDate, importance, userId) {
    await memoryRepo.create({
        device_id: deviceId,
        user_id: userId,
        content,
        source_date: sourceDate,
        importance,
    });
}
//# sourceMappingURL=long-term.js.map