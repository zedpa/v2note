/**
 * notification CRUD — 通知持久化
 */
import { query, queryOne, execute } from "../pool.js";
// ── Read ──
/** 按设备查询最近通知 */
export async function findByDevice(deviceId, limit = 50) {
    return query(`SELECT * FROM notification WHERE device_id = $1 ORDER BY created_at DESC LIMIT $2`, [deviceId, limit]);
}
/** 按用户查询最近通知 */
export async function findByUser(userId, limit = 50) {
    return query(`SELECT * FROM notification WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
}
/** 查询未读数量（按设备） */
export async function countUnread(deviceId) {
    const row = await queryOne(`SELECT COUNT(*) as cnt FROM notification WHERE device_id = $1 AND read = false`, [deviceId]);
    return parseInt(row?.cnt ?? "0", 10);
}
/** 查询未读数量（按用户，跨设备） */
export async function countUnreadByUser(userId) {
    const row = await queryOne(`SELECT COUNT(*) as cnt FROM notification WHERE user_id = $1 AND read = false`, [userId]);
    return parseInt(row?.cnt ?? "0", 10);
}
// ── Write ──
/** 创建通知 */
export async function create(input) {
    const row = await queryOne(`INSERT INTO notification (device_id, user_id, type, title, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`, [
        input.deviceId,
        input.userId ?? null,
        input.type,
        input.title ?? null,
        input.body ?? null,
    ]);
    return row;
}
/** 标记单条已读 */
export async function markRead(id) {
    await execute(`UPDATE notification SET read = true WHERE id = $1`, [id]);
}
/** 标记设备所有通知已读 */
export async function markAllRead(deviceId) {
    await execute(`UPDATE notification SET read = true WHERE device_id = $1 AND read = false`, [deviceId]);
}
/** 标记用户所有通知已读（跨设备） */
export async function markAllReadByUser(userId) {
    await execute(`UPDATE notification SET read = true WHERE user_id = $1 AND read = false`, [userId]);
}
//# sourceMappingURL=notification.js.map