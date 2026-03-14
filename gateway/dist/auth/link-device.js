import { execute } from "../db/pool.js";
/**
 * Link a device to a user and backfill all historical data with user_id.
 */
export async function linkDeviceToUser(deviceId, userId) {
    // 1. Set device.user_id
    await execute(`UPDATE device SET user_id = $1 WHERE id = $2`, [userId, deviceId]);
    // 2. Backfill user_id on all tables that reference device_id
    const tables = [
        "record",
        "memory",
        "goal",
        "pending_intent",
        "notebook",
        "ai_diary",
        "weekly_review",
        "skill_config",
    ];
    for (const table of tables) {
        await execute(`UPDATE ${table} SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, deviceId]);
    }
    // soul and user_profile use ON CONFLICT (device_id), so handle separately
    // Set user_id if not already set
    await execute(`UPDATE soul SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, deviceId]);
    await execute(`UPDATE user_profile SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, deviceId]);
    console.log(`[auth] Linked device ${deviceId} to user ${userId}, backfilled data`);
}
//# sourceMappingURL=link-device.js.map