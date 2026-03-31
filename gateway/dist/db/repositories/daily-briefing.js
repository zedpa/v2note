import { queryOne } from "../pool.js";
/** 按设备查询（游客 fallback） */
export async function findByDeviceAndDate(deviceId, date, type = "morning") {
    return queryOne(`SELECT * FROM daily_briefing
     WHERE device_id = $1 AND briefing_date = $2 AND briefing_type = $3`, [deviceId, date, type]);
}
/** 按用户查询（跨设备共享） */
export async function findByUserAndDate(userId, date, type = "morning") {
    return queryOne(`SELECT * FROM daily_briefing
     WHERE user_id = $1 AND briefing_date = $2 AND briefing_type = $3`, [userId, date, type]);
}
/**
 * Upsert a briefing.
 * - 已登录用户：按 (user_id, date, type) 唯一，跨设备共享
 * - 游客：按 (device_id, date, type) 唯一
 */
export async function upsert(deviceId, date, type, content, userId) {
    if (userId) {
        const row = await queryOne(`INSERT INTO daily_briefing (device_id, user_id, briefing_date, briefing_type, content)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, briefing_date, briefing_type) WHERE user_id IS NOT NULL
       DO UPDATE SET content = $5, generated_at = now()
       RETURNING *`, [deviceId, userId, date, type, JSON.stringify(content)]);
        return row;
    }
    const row = await queryOne(`INSERT INTO daily_briefing (device_id, briefing_date, briefing_type, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id, briefing_date, briefing_type)
     DO UPDATE SET content = $4, generated_at = now()
     RETURNING *`, [deviceId, date, type, JSON.stringify(content)]);
    return row;
}
/**
 * Check if a fresh cached briefing exists (within TTL hours).
 * 已登录用户按 user_id 查，游客按 device_id 查。
 */
export async function findFresh(deviceId, date, type, ttlHours = 2, userId) {
    if (userId) {
        return queryOne(`SELECT * FROM daily_briefing
       WHERE user_id = $1 AND briefing_date = $2 AND briefing_type = $3
       AND generated_at > now() - interval '1 hour' * $4`, [userId, date, type, ttlHours]);
    }
    return queryOne(`SELECT * FROM daily_briefing
     WHERE device_id = $1 AND briefing_date = $2 AND briefing_type = $3
     AND generated_at > now() - interval '1 hour' * $4`, [deviceId, date, type, ttlHours]);
}
//# sourceMappingURL=daily-briefing.js.map