import { execute, queryOne } from "../db/pool.js";

/**
 * Link a device to a user and backfill all historical data with user_id.
 */
export async function linkDeviceToUser(
  deviceId: string,
  userId: string,
): Promise<void> {
  // 1. Set device.user_id
  await execute(
    `UPDATE device SET user_id = $1 WHERE id = $2`,
    [userId, deviceId],
  );

  // 2. Backfill user_id on all tables that reference device_id
  const tables = [
    "record",
    "todo",
    "memory",
    "pending_intent",
    "notebook",
    "ai_diary",
    "skill_config",
  ];

  for (const table of tables) {
    await execute(
      `UPDATE ${table} SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`,
      [userId, deviceId],
    );
  }

  // soul and user_profile have a unique constraint on user_id.
  // If the user already has a record (from another device), skip backfill
  // and remove the orphaned device-level record to avoid duplicates.
  for (const table of ["soul", "user_profile"]) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM ${table} WHERE user_id = $1`,
      [userId],
    );
    if (existing) {
      // User already has a record — delete the device-only one (if any)
      await execute(
        `DELETE FROM ${table} WHERE device_id = $1 AND user_id IS NULL`,
        [deviceId],
      );
    } else {
      // No user-level record yet — claim this device's record
      await execute(
        `UPDATE ${table} SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`,
        [userId, deviceId],
      );
    }
  }

  console.log(`[auth] Linked device ${deviceId} to user ${userId}, backfilled data`);
}
