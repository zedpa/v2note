import { execute, queryOne } from "../db/pool.js";
/**
 * Link a device to a user and backfill all historical data with user_id.
 */
export async function linkDeviceToUser(deviceId, userId) {
    // 1. Set device.user_id
    await execute(`UPDATE device SET user_id = $1 WHERE id = $2`, [userId, deviceId]);
    // 2. Backfill user_id on all tables that reference device_id
    const tables = [
        "record",
        "todo",
        "memory",
        "pending_intent",
        "notebook",
        "skill_config",
    ];
    for (const table of tables) {
        await execute(`UPDATE ${table} SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, deviceId]);
    }
    // ai_diary has a unique constraint on (user_id, notebook, entry_date).
    // If the user already has an entry for a given (notebook, entry_date) from
    // another device, merge the device-only entry's content into it, then delete.
    await execute(`UPDATE ai_diary AS existing
     SET full_content = existing.full_content || E'\\n\\n' || orphan.full_content,
         summary = LEFT(existing.full_content || E'\\n\\n' || orphan.full_content, 200),
         updated_at = now()
     FROM ai_diary AS orphan
     WHERE orphan.device_id = $2
       AND orphan.user_id IS NULL
       AND existing.user_id = $1
       AND existing.notebook = orphan.notebook
       AND existing.entry_date = orphan.entry_date`, [userId, deviceId]);
    // 删除已合并的 device-only 条目
    await execute(`DELETE FROM ai_diary AS orphan
     USING ai_diary AS existing
     WHERE orphan.device_id = $2
       AND orphan.user_id IS NULL
       AND existing.user_id = $1
       AND existing.notebook = orphan.notebook
       AND existing.entry_date = orphan.entry_date`, [userId, deviceId]);
    // 无冲突的 device-only 条目直接绑定 user_id
    await execute(`UPDATE ai_diary SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, deviceId]);
    // soul and user_profile have a unique constraint on user_id.
    // If the user already has a record (from another device), skip backfill
    // and remove the orphaned device-level record to avoid duplicates.
    for (const table of ["soul", "user_profile"]) {
        const existing = await queryOne(`SELECT id FROM ${table} WHERE user_id = $1`, [userId]);
        if (existing) {
            // User already has a record — delete the device-only one (if any)
            await execute(`DELETE FROM ${table} WHERE device_id = $1 AND user_id IS NULL`, [deviceId]);
        }
        else {
            // No user-level record yet — claim this device's record
            await execute(`UPDATE ${table} SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, deviceId]);
        }
    }
    console.log(`[auth] Linked device ${deviceId} to user ${userId}, backfilled data`);
}
//# sourceMappingURL=link-device.js.map